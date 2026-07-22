import { HttpException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { Resend } from "resend";

import { apiException } from "../common/http";

type AuthEmail = {
  to: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
};

type EmailProvider = "gmail" | "resend";
type GmailTransport = Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;
  private readonly resendClient: Resend | null;
  private readonly gmailTransport: GmailTransport | null;
  private readonly from: string;

  constructor() {
    this.provider = emailProvider();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.EMAIL_FROM?.trim();
    const gmailUser = process.env.GMAIL_USER?.trim();
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
    const gmailFromName = process.env.GMAIL_FROM_NAME?.trim().replace(/[\r\n]/g, "") || "IVORY";
    const production = process.env.NODE_ENV === "production";

    if (this.provider === "gmail") {
      if (production && (!gmailUser || !gmailAppPassword)) {
        throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail.");
      }
      this.gmailTransport = gmailUser && gmailAppPassword ? nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailAppPassword },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      }) : null;
      this.resendClient = null;
      this.from = gmailUser ? `${gmailFromName} <${gmailUser}>` : "IVORY <noreply@example.test>";
      return;
    }

    if (production && (!apiKey || !configuredFrom)) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend.");
    }
    this.resendClient = apiKey ? new Resend(apiKey) : null;
    this.gmailTransport = null;
    this.from = configuredFrom || "IVORY <onboarding@resend.dev>";
  }

  async sendAuthEmail(message: AuthEmail) {
    if ((this.provider === "gmail" && !this.gmailTransport) || (this.provider === "resend" && !this.resendClient)) {
      this.logger.log(`[development email] ${message.subject}: ${message.actionUrl}`);
      return;
    }

    const actionUrl = escapeHtml(message.actionUrl);
    const heading = escapeHtml(message.heading);
    const body = escapeHtml(message.body);
    const actionLabel = escapeHtml(message.actionLabel);
    const payload = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: `${message.heading}\n\n${message.body}\n\n${message.actionUrl}`,
      html: `<div style="background:#f5f1e8;padding:40px 16px;font-family:Arial,sans-serif;color:#29251f"><div style="max-width:560px;margin:auto;background:#fff;padding:36px;border:1px solid #ded9cf"><p style="font-size:12px;letter-spacing:.2em;margin:0 0 24px">IVORY</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin:0 0 16px">${heading}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 28px">${body}</p><a href="${actionUrl}" style="display:inline-block;background:#29251f;color:#fff;text-decoration:none;padding:13px 22px">${actionLabel}</a><p style="font-size:12px;line-height:1.5;color:#746d62;margin:28px 0 0">If you did not request this email, you can safely ignore it.</p></div></div>`,
    };

    if (this.provider === "gmail") {
      await this.sendWithGmail(payload);
      return;
    }

    await this.sendWithResend(payload, message);
  }

  private async sendWithGmail(payload: { from: string; to: string[]; subject: string; text: string; html: string }) {
    try {
      const result = await this.gmailTransport!.sendMail(payload);
      this.logger.log(`Gmail SMTP accepted ${payload.subject}; messageId=${result.messageId}`);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Gmail SMTP failed for ${payload.subject}: ${formatSmtpError(error)}`);
      apiException(502, "EMAIL_DELIVERY_FAILED", "Email belum berhasil dikirim. Silakan coba kembali.");
    }
  }

  private async sendWithResend(payload: { from: string; to: string[]; subject: string; text: string; html: string }, message: AuthEmail) {
    const idempotencyKey = `auth/${createHash("sha256").update(`${message.to}\n${message.subject}\n${message.actionUrl}`).digest("hex")}`;

    try {
      let result = await this.resendClient!.emails.send(payload, { idempotencyKey });
      if (result.error && isTransientError(result.error)) {
        this.logger.warn(`Resend request will be retried for ${message.subject}: ${formatResendError(result.error)}`);
        result = await this.resendClient!.emails.send(payload, { idempotencyKey });
      }

      if (result.error) {
        this.logger.error(`Resend rejected ${message.subject}: ${formatResendError(result.error)}`);
        apiException(502, "EMAIL_DELIVERY_FAILED", "Email belum berhasil dikirim. Silakan coba kembali.");
      }

      if (result.data?.id) this.logger.log(`Resend accepted ${message.subject}; emailId=${result.data.id}`);
      else this.logger.warn(`Resend accepted ${message.subject}, but the response did not contain an email ID.`);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Resend request failed for ${message.subject}: ${error instanceof Error ? error.message : "unknown error"}`);
      apiException(502, "EMAIL_DELIVERY_FAILED", "Email belum berhasil dikirim. Silakan coba kembali.");
    }
  }
}

function emailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "gmail";
  if (configured === "gmail" || configured === "resend") return configured;
  throw new Error('EMAIL_PROVIDER must be either "gmail" or "resend".');
}

function isTransientError(error: { statusCode?: number | null } | null) {
  return error?.statusCode == null || error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
}

function formatResendError(error: { name?: string; message?: string; statusCode?: number | null }) {
  return `status=${error.statusCode ?? "network"} name=${error.name ?? "unknown_error"} message=${error.message ?? "unknown error"}`;
}

function formatSmtpError(error: unknown) {
  if (!error || typeof error !== "object") return "unknown_error";
  const smtpError = error as { code?: string; command?: string; responseCode?: number };
  return `code=${smtpError.code ?? "unknown"} responseCode=${smtpError.responseCode ?? "unknown"} command=${smtpError.command ?? "unknown"}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
