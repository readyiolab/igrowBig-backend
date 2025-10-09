require("dotenv").config();
const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpUser, smtpPass } = require("../config/dotenvConfig");


const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false, // Use SSL
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

// Verify transporter on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Verification Failed:", error);
  } else {
    console.log("SMTP Transporter is ready to send emails");
  }
});

const emailStyles = `
    font-family: Arial, sans-serif;
    color: #333;
    line-height: 1.6;
`;

// ✅ Newsletter Confirmation Email
const sendNewsletterSubscriptionEmail = async (to, name = "Subscriber") => {
  const htmlContent = `
        <div style="${emailStyles}">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0;">
                <tr>
                    <td style="background-color: #4CAF50; padding: 20px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0;">You're Subscribed!</h2>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 20px;">
                        <p>Hello ${name},</p>
                        <p>Thanks for subscribing to our newsletter! 🎉</p>
                        <p>We'll keep you updated with the latest news, exclusive content, and helpful resources from the iGrow Big team.</p>
                        <p>If you ever wish to unsubscribe, just click the link at the bottom of any email.</p>
                        <p>Regards,<br>The iGrow Big Team</p>
                    </td>
                </tr>
                <tr>
                    <td style="background-color: #f0f0f0; padding: 10px; text-align: center; font-size: 12px;">
                        © 2025 iGrow Big. All rights reserved.
                    </td>
                </tr>
            </table>
        </div>
    `;

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "You're subscribed to our newsletter!",
    html: htmlContent,
  });
};

// Existing Welcome Email
const sendWelcomeEmail = async (
  to,
  { name, email, password, subscription_plan, subscription_status, login_url, store_url } = {},
  isAdminCreated = false
) => {
  const planDetails = subscription_plan === "yearly" ? "$156/year" : "$16.25/month";

  const htmlContent = isAdminCreated
    ? `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(90deg, #4CAF50, #66BB6A); padding: 30px; text-align: center;">
              <img src="https://via.placeholder.com/150x50?text=Arbilo+Logo" alt="Arbilo Logo" style="max-width: 150px; margin-bottom: 10px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to iGrow Big!</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 15px;">Hello ${name || "User"},</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">An admin has created your account. Below are your login credentials and subscription details:</p>
              <table width="100%" cellpadding="12" cellspacing="0" style="background: #f8f8f8; border-radius: 8px; margin-bottom: 20px;">
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Email:</td><td style="color: #333333;">${email}</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Password:</td><td style="color: #333333;">${password}</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Plan:</td><td style="color: #333333;">${planDetails} (${subscription_status})</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Login URL:</td><td><a href="${login_url}" style="color: #4CAF50; text-decoration: none;">${login_url}</a></td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Store URL:</td><td><a href="${store_url}" style="color: #4CAF50; text-decoration: none;">${store_url}</a></td></tr>
              </table>
              <p style="color: #666666; font-size: 14px; font-style: italic; margin: 0 0 15px;">Taxes extra, if applicable as per your local regulations.</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Please change your password after your first login for security.</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0;">Regards,<br>The iGrow Big Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666666;">
              © 2025 iGrow Big. All rights reserved.
            </td>
          </tr>
        </table>
      </div>
    `
    : `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(90deg, #4CAF50, #66BB6A); padding: 30px; text-align: center;">
              <img src="https://via.placeholder.com/150x50?text=Arbilo+Logo" alt="Arbilo Logo" style="max-width: 150px; margin-bottom: 10px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to Arbilo!</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 15px;">Hello ${name || "User"},</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Thank you for signing up! Your account has been created with the following details:</p>
              <table width="100%" cellpadding="12" cellspacing="0" style="background: #f8f8f8; border-radius: 8px; margin-bottom: 20px;">
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Email:</td><td style="color: #333333;">${email}</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Password:</td><td style="color: #333333;">${password}</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Plan:</td><td style="color: #333333;">${planDetails} (${subscription_status})</td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Login URL:</td><td><a href="${login_url}" style="color: #4CAF50; text-decoration: none;">${login_url}</a></td></tr>
                <tr><td width="30%" style="color: #555555; font-weight: 600;">Store URL:</td><td><a href="${store_url}" style="color: #4CAF50; text-decoration: none;">${store_url}</a></td></tr>
              </table>
              <p style="color: #666666; font-size: 14px; font-style: italic; margin: 0 0 15px;">Taxes extra, if applicable as per your local regulations.</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Get started by logging in with your credentials.</p>
              <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0;">Regards,<br>The iGrow Big Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666666;">
              © 2025 iGrow Big. All rights reserved.
            </td>
          </tr>
        </table>
      </div>
    `;

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "Welcome to iGrow Big",
    html: htmlContent,
  });
};

const sendPasswordResetEmail = async (
  to,
  { name, email, password, subscription_plan, subscription_status, login_url, store_url } = {}
) => {
  const planDetails = subscription_plan === "yearly" ? "$156/year" : "$16.25/month";

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <tr>
          <td style="background: linear-gradient(90deg, #4CAF50, #66BB6A); padding: 30px; text-align: center;">
            <img src="https://via.placeholder.com/150x50?text=Arbilo+Logo" alt="Arbilo Logo" style="max-width: 150px; margin-bottom: 10px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Your Backoffice Password Has Been Reset</h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px;">
            <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 15px;">Hello ${name || "User"},</p>
            <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Your password has been reset by an admin. Below are your new login credentials and account details:</p>
            <table width="100%" cellpadding="12" cellspacing="0" style="background: #f8f8f8; border-radius: 8px; margin-bottom: 20px;">
              <tr><td width="30%" style="color: #555555; font-weight: 600;">Email:</td><td style="color: #333333;">${email}</td></tr>
              <tr><td width="30%" style="color: #555555; font-weight: 600;">New Password:</td><td style="color: #333333;">${password}</td></tr>
              <tr><td width="30%" style="color: #555555; font-weight: 600;">Plan:</td><td style="color: #333333;">${planDetails} (${subscription_status})</td></tr>
              <tr><td width="30%" style="color: #555555; font-weight: 600;">Login URL:</td><td><a href="${login_url}" style="color: #4CAF50; text-decoration: none;">${login_url}</a></td></tr>
              <tr><td width="30%" style="color: #555555; font-weight: 600;">Store URL:</td><td><a href="${store_url}" style="color: #4CAF50; text-decoration: none;">${store_url}</a></td></tr>
            </table>
            <p style="color: #666666; font-size: 14px; font-style: italic; margin: 0 0 15px;">Taxes extra, if applicable as per your local regulations.</p>
            <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Please change your password after logging in for security.</p>
            <p style="color: #333333; font-size: 16px; line-height: 1.5; margin: 0;">Regards,<br>The iGrow Big Team</p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666666;">
            © 2025 iGrow Big. All rights reserved.
          </td>
        </tr>
      </table>
    </div>
  `;

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "Your iGrow Big Password Has Been Reset",
    html: htmlContent,
  });
};

const sendDomainNotification = async (email, domain, status, instructions = null) => {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn(`⚠️ Invalid or missing email for domain notification: ${domain}. Skipping email.`);
    return;
  }

  const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
  const serverIP = process.env.SERVER_IP || "82.29.160.167";
  const statusMessages = {
    pending: `Your domain ${domain} is being verified. Follow the DNS setup instructions below. ⏳`,
    verified: `Great news! Your domain ${domain} is verified and active! 🎉 Visit https://${domain} to see your store.`,
    unverified: `We couldn't verify ${domain}. Check your DNS settings and try again. ❌`,
  };

  const dnsInstructions = instructions ? `
    <h3>DNS Setup Instructions for ${domain}</h3>
    <p><strong>Step 1: Verify Domain Ownership (TXT Record)</strong></p>
    <ul>
      <li>Type: TXT</li>
      <li>Host: _igrowbig-verification.${domain}</li>
      <li>Value: ${instructions.step1.value}</li>
      <li>TTL: Automatic or 3600</li>
      <li>Description: Add this to your DNS provider to prove ownership. Wait 1-5 minutes.</li>
    </ul>
    <p><strong>Step 2: Point Domain (CNAME - Recommended)</strong></p>
    <ul>
      <li>Type: CNAME</li>
      <li>Host: ${domain}</li>
      <li>Value: ${baseDomain}</li>
      <li>TTL: Automatic or 3600</li>
      <li>Description: Routes traffic to our servers.</li>
    </ul>
    <p><strong>Step 3: Alternative (A Record)</strong></p>
    <ul>
      <li>Type: A</li>
      <li>Host: ${domain}</li>
      <li>Value: ${serverIP}</li>
      <li>TTL: Automatic or 3600</li>
      <li>Description: Use if CNAME doesn't work.</li>
    </ul>
    <p><strong>Notes:</strong> DNS changes may take 48 hours to propagate. Contact support@arbilo.com for help.</p>
  ` : '';

  const htmlContent = `
    <div style="${emailStyles}">
      <h2>Domain Update for ${domain}</h2>
      <p>${statusMessages[status] || 'Domain status updated.'}</p>
      ${status === 'verified' ? `<p>Your store is live at <a href="https://${domain}">https://${domain}</a>!</p>` : ''}
      ${dnsInstructions}
      <p>Regards,<br>iGrow Big Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to: email,
    subject: `Domain ${domain} ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    html: htmlContent,
  });
};
module.exports = {
  transporter,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendNewsletterSubscriptionEmail,
  sendDomainNotification // ✅ Exported new newsletter function
};
