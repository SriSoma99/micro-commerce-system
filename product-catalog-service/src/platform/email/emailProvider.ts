import { logger } from "../../utils/logger";

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }>;
}

export class SimulatedEmailProvider implements EmailProvider {
  private sentEmails: Array<SendEmailOptions & { sentAt: string }> = [];

  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
    const messageId = `sim_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.sentEmails.push({ ...options, sentAt: new Date().toISOString() });
    logger.info("SimulatedEmailProvider", `[EMAIL SENT] To: ${options.to} | Subject: ${options.subject} | Id: ${messageId}`);
    return { success: true, messageId };
  }

  getSentEmails(): Array<SendEmailOptions & { sentAt: string }> {
    return [...this.sentEmails];
  }

  clear(): void {
    this.sentEmails = [];
  }
}

let defaultEmailProvider: EmailProvider = new SimulatedEmailProvider();

export function getEmailProvider(): EmailProvider {
  return defaultEmailProvider;
}

export function setEmailProvider(provider: EmailProvider): void {
  defaultEmailProvider = provider;
}
