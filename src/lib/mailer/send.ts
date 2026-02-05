import nodemailer from "nodemailer";

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

/**
 * Send an email - works with any SMTP provider
 * If no SMTP config found, logs to console
 */
export const sendEmail = async (options: EmailOptions) => {
  // Check if SMTP is configured
  const isConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD;

  // If not configured, just console log
  if (!isConfigured) {
    console.log("\n" + "=".repeat(50));
    console.log("📧 EMAIL (logged to console - no SMTP configured)");
    console.log("=".repeat(50));
    console.log("To:", Array.isArray(options.to) ? options.to.join(", ") : options.to);
    console.log("From:", options.from || "no-reply@example.com");
    console.log("Subject:", options.subject);
    console.log("-".repeat(50));
    console.log(options.html || options.text);
    console.log("=".repeat(50) + "\n");
    return { success: true, messageId: "console-" + Date.now() };
  }

  // Send actual email
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: options.from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log("✅ Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email failed:", error);
    throw error;
  }
};