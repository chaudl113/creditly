import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

/** Sends through SMTP (Mailpit in docker) when SMTP_HOST is set, else logs. */
export async function sendMail(mail: Mail): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Creditly <no-reply@creditly.test>",
    ...mail,
  });
}
