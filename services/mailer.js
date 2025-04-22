const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpUser, smtpPass } = require("../config/dotenvConfig");

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: true,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Mail Transporter Error:", error);
  } else {
    console.log("✅ Mail Transporter Ready");
  }
});

const sendWelcomeEmail = async (name, email) => {
  try {
    const mailOptions = {
      from: '"Arbilo" <hello@arbilo.com>',
      to: `"${name}" <${email}>`,
      subject: "Welcome to Arbilo! 🚀",
      html: `<!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Arbilo</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: Arial, sans-serif; color: #333;">
          <table width="100%" bgcolor="#f8f8f8" cellpadding="0" cellspacing="0">
              <tr>
                  <td align="center">
                      <table width="600" bgcolor="#ffffff" cellpadding="0" cellspacing="0" style="border-radius: 8px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);">
                          <tr>
                              <td align="center" bgcolor="#222222" style="padding: 20px;">
                                  <img src="https://res.cloudinary.com/dp50h8gbe/image/upload/v1738745363/gwkvk5vkbzvb5b7hosxj.png" alt="Arbilo Logo" width="120" style="display: block;">
                              </td>
                          </tr>
                          <tr>
                              <td align="center" bgcolor="#222222" style="padding: 20px; color: #ffffff; font-size: 24px; font-weight: bold;">
                                  Welcome to Arbilo, ${name}!
                              </td>
                          </tr>
                          <tr>
                              <td align="center" style="padding: 30px; color: #444; font-size: 16px;">
                                  <p>Dear <strong>${name}</strong>,</p>
                                  <p>We’re thrilled to have you onboard! Get ready to explore real-time arbitrage signals and premium features.</p>
                                  <p>Click the button below to log in and start your journey:</p>
                                  <a href="https://arbilo.com/login" style="display: inline-block; background-color: #222222; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 5px; font-size: 16px; margin-top: 20px; font-weight: bold;">Get Started</a>
                              </td>
                          </tr>
                          <tr>
                              <td align="center" bgcolor="#eeeeee" style="padding: 15px; font-size: 14px; color: #555;">
                                  <p><strong>Stay Connected</strong></p>
                                  <table cellpadding="0" cellspacing="0">
                                      <tr>
                                          <td><a href="https://facebook.com/yourpage"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="30" alt="Facebook"></a></td>
                                          <td width="15"></td>
                                          <td><a href="https://twitter.com/yourpage"><img src="https://cdn-icons-png.flaticon.com/512/733/733579.png" width="30" alt="Twitter"></a></td>
                                          <td width="15"></td>
                                          <td><a href="https://instagram.com/yourpage"><img src="https://cdn-icons-png.flaticon.com/512/733/733558.png" width="30" alt="Instagram"></a></td>
                                      </tr>
                                  </table>
                                  <p style="margin-top: 15px;">© 2025 Arbilo. All rights reserved.</p>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </body>
      </html>`,
    };

    await transporter.sendMail(mailOptions);
    console.log("Welcome email sent successfully to", email);
  } catch (err) {
    console.error("Error sending welcome email:", err);
    throw new Error("Failed to send welcome email");
  }
};

module.exports = { sendWelcomeEmail };