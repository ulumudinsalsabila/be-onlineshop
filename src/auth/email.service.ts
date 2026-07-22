import { HttpException, Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.EMAIL_FROM?.trim();
    if (process.env.NODE_ENV === "production" && (!apiKey || !configuredFrom)) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production.");
    }
    this.client = apiKey ? new Resend(apiKey) : null;
    this.from = configuredFrom || "IVORY <onboarding@resend.dev>";
  }

  async sendAuthEmail(message: AuthEmail) {
    if (!this.client) {
      this.logger.log(`[development email] ${message.subject}: ${message.actionUrl}`);
      return;
    }

    const actionUrl = escapeHtml(message.actionUrl);
    const heading = escapeHtml(message.heading);
    const body = escapeHtml(message.body);
    const actionLabel = escapeHtml(message.actionLabel);
    try {
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: `${message.heading}\n\n${message.body}\n\n${message.actionUrl}`,
        html: `<div style="background:#f5f1e8;padding:40px 16px;font-family:Arial,sans-serif;color:#29251f"><div style="max-width:560px;margin:auto;background:#fff;padding:36px;border:1px solid #ded9cf"><p style="font-size:12px;letter-spacing:.2em;margin:0 0 24px">IVORY</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin:0 0 16px">${heading}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 28px">${body}</p><a href="${actionUrl}" style="display:inline-block;background:#29251f;color:#fff;text-decoration:none;padding:13px 22px">${actionLabel}</a><p style="font-size:12px;line-height:1.5;color:#746d62;margin:28px 0 0">Jika Anda tidak meminta email ini, abaikan pesan ini.</p></div></div>`,
      });
      if (error || !data?.id) {
        this.logger.error(`Resend rejected ${message.subject}: ${error?.name ?? "unknown_error"} ${error?.message ?? "missing message id"}`);
        apiException(502, "EMAIL_DELIVERY_FAILED", "Email belum berhasil dikirim. Silakan coba kembali.");
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Resend request failed for ${message.subject}: ${error instanceof Error ? error.message : "unknown error"}`);
      apiException(502, "EMAIL_DELIVERY_FAILED", "Email belum berhasil dikirim. Silakan coba kembali.");
    }
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
