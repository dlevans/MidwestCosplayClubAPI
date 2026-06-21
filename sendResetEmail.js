const nodemailer = require("nodemailer");

async function sendResetEmail(toEmail, resetToken) {
  try {
    let transporter = nodemailer.createTransport({
      host: process.env.host, // Replace with your SMTP host
      port: process.env.port, // Use 465 for SSL, or 25 if no encryption
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.user, // Your email
        pass: process.env.password, // Your email password
      },
    });

    let resetLink = process.env.resetlink;

    let mailOptions = {
      from: process.env.from,
      to: toEmail,
      subject: "Password Reset Request",
      text: `Click the following link to reset your password: ${resetLink}`,
      html: `<p>Click the following link to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
    };

    let info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

module.exports = sendResetEmail;
