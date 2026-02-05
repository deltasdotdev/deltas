import { sendEmail } from "./send";

export async function test() {
  // Simple usage - anywhere in your code
  await sendEmail({
    to: "user@example.com",
    subject: "Welcome!",
    html: "<h1>Hello!</h1><p>Welcome to our app.</p>",
  });

  // Multiple recipients
  await sendEmail({
    to: ["user1@example.com", "user2@example.com"],
    subject: "Team Update",
    text: "Meeting at 3pm today",
  });

  // Custom from address
  await sendEmail({
    to: "customer@example.com",
    subject: "Order Confirmation",
    html: "<p>Your order #12345 has been confirmed</p>",
    from: "orders@mystore.com",
  });
}

