require("dotenv").config();
const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpUser, smtpPass } = require("../config/dotenvConfig");
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

// Verify transporter on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Verification Failed:", error);
    console.error("SMTP Config:", { host: smtpHost, port: smtpPort, user: smtpUser });
  } else {
    console.log("SMTP Transporter is ready to send emails");
    console.log(`Sending from: ${smtpUser}`);
  }
});

// Consolidated Styles (merged duplicates, kept all unique)
const emailStyles = `
  font-family: Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
`;

const buttonStyle = `
  display: inline-block;
  padding: 12px 24px;
  margin: 16px 0;
  background-color: #4CAF50;
  color: white !important;
  text-decoration: none;
  border-radius: 4px;
  font-weight: bold;
`;

const codeStyle = `
  background-color: #f4f4f4;
  padding: 12px;
  border-left: 4px solid #4CAF50;
  margin: 10px 0;
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
`;

const stepStyle = `
  background-color: white;
  padding: 16px;
  margin: 16px 0;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
`;

const emailBaseStyles = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background-color: #f4f4f4;
  padding: 20px;
  color: #333333;
`;

const containerStyles = `
  max-width: 600px;
  margin: 0 auto;
  background-color: #ffffff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
`;

const headerStyles = `
  background: linear-gradient(90deg, #4CAF50, #66BB6A);
  padding: 30px;
  text-align: center;
  color: #ffffff;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`;

const contentStyles = `
  padding: 30px;
`;

const paragraphStyles = `
  font-size: 16px;
  line-height: 1.5;
  margin: 0 0 15px;
  color: #333333;
`;

const detailsBoxStyles = `
  background: #f8f8f8;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
`;

const detailItemStyles = `
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 16px;
`;

const labelStyles = `
  font-weight: 600;
  color: #555555;
  width: 30%;
`;

const valueStyles = `
  color: #333333;
  width: 70%;
  word-break: break-all;
`;

const linkStyles = `
  color: #4CAF50;
  text-decoration: none;
`;

const footerStyles = `
  background-color: #f0f0f0;
  padding: 15px;
  text-align: center;
  font-size: 12px;
  color: #666666;
`;

// Helper to generate HTML email template (reusable for consistency)
const generateEmailTemplate = (headerText, contentHTML, footerText = "If you did not request this, please ignore this email.") => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headerText}</title>
    <style>
      body { ${emailBaseStyles} }
      .container { ${containerStyles} }
      .header { ${headerStyles} }
      .content { ${contentStyles} }
      .paragraph { ${paragraphStyles} }
      .details-box { ${detailsBoxStyles} }
      .detail-item { ${detailItemStyles} }
      .label { ${labelStyles} }
      .value { ${valueStyles} }
      a { ${linkStyles} }
      .button { ${buttonStyle} }
      .footer { ${footerStyles} }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">${headerText}</div>
      <div class="content">
        ${contentHTML}
      </div>
      <div class="footer">
        ${footerText}<br>
        &copy; ${new Date().getFullYear()} iGrow Big. All rights reserved.
      </div>
    </div>
  </body>
  </html>
`;

// Newsletter Confirmation Email (updated to use template for consistency)
const sendNewsletterSubscriptionEmail = async (to, name = "Subscriber") => {
  const contentHTML = `
    <p class="paragraph">Hello ${name},</p>
    <p class="paragraph">Thanks for subscribing to our newsletter!</p>
    <p class="paragraph">We'll keep you updated with the latest news, exclusive content, and helpful resources from the iGrow Big team.</p>
    <p class="paragraph">If you ever wish to unsubscribe, just click the link at the bottom of any email.</p>
    <p class="paragraph">Regards,<br>The iGrow Big Team</p>
  `;

  const html = generateEmailTemplate("You're Subscribed!", contentHTML);

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "You're subscribed to our newsletter!",
    html,
  });
};

// Welcome Email (updated to use template)
const sendWelcomeEmail = async (
  to,
  { name, email, password, subscription_plan, subscription_status, login_url, store_url } = {},
  isAdminCreated = false
) => {
  const planDetails = subscription_plan === "yearly" ? "$156/year" : "$16.25/month";

  const contentHTML = `
    <p class="paragraph">Hello ${name || "User"},</p>
    <p class="paragraph">${isAdminCreated ? "An admin has created your account." : "Thank you for signing up!"} Below are your login credentials and subscription details:</p>
    <div class="details-box">
      <div class="detail-item"><span class="label">Email:</span> <span class="value">${email}</span></div>
      <div class="detail-item"><span class="label">Password:</span> <span class="value">${password}</span></div>
      <div class="detail-item"><span class="label">Plan:</span> <span class="value">${planDetails} (${subscription_status})</span></div>
      <div class="detail-item"><span class="label">Login URL:</span> <span class="value"><a href="${login_url}">${login_url}</a></span></div>
      <div class="detail-item"><span class="label">Store URL:</span> <span class="value"><a href="${store_url}">${store_url}</a></span></div>
    </div>
    <p class="paragraph">Please change your password after your first login for security.</p>
    <p class="paragraph">Get started by logging in with your credentials.</p>
    <a href="${login_url}" class="button">Login Now</a>
    <p class="paragraph">Regards,<br>The iGrow Big Team</p>
  `;

  const html = generateEmailTemplate(isAdminCreated ? "Account Created by Admin" : "Welcome to iGrow Big!", contentHTML);

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: isAdminCreated ? "Your iGrow Big Account is Ready" : "Welcome to iGrow Big",
    html,
  });
};

// Password Reset Email (renamed from sendPasswordResetEmail, updated to use template)
const sendPasswordResetEmail = async (
  to,
  { name, email, password, subscription_plan, subscription_status, login_url, store_url } = {}
) => {
  const planDetails = subscription_plan === "yearly" ? "$156/year" : "$16.25/month";

  const contentHTML = `
    <p class="paragraph">Hello ${name || "User"},</p>
    <p class="paragraph">Your password has been reset by an admin. Below are your new login credentials and account details:</p>
    <div class="details-box">
      <div class="detail-item"><span class="label">Email:</span> <span class="value">${email}</span></div>
      <div class="detail-item"><span class="label">New Password:</span> <span class="value">${password}</span></div>
      <div class="detail-item"><span class="label">Plan:</span> <span class="value">${planDetails} (${subscription_status})</span></div>
      <div class="detail-item"><span class="label">Login URL:</span> <span class="value"><a href="${login_url}">${login_url}</a></span></div>
      <div class="detail-item"><span class="label">Store URL:</span> <span class="value"><a href="${store_url}">${store_url}</a></span></div>
    </div>
    <p class="paragraph">Please change your password after logging in for security.</p>
    <a href="${login_url}" class="button">Login Now</a>
    <p class="paragraph">Regards,<br>The iGrow Big Team</p>
  `;

  const html = generateEmailTemplate("Your Password Has Been Reset", contentHTML);

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "Your iGrow Big Password Has Been Reset",
    html,
  });
};

// New: Send Password Change Notification (for security alerts)
const sendPasswordChangeEmail = async (to, name = "User") => {
  const contentHTML = `
    <p class="paragraph">Hello ${name},</p>
    <p class="paragraph">Your password was recently changed. If this was you, no further action is needed.</p>
    <p class="paragraph">If you did not make this change, please contact support immediately.</p>
    <a href="mailto:igrowbignetwork@gmail.com" class="button">Contact Support</a>
    <p class="paragraph">Regards,<br>The iGrow Big Team</p>
  `;

  const html = generateEmailTemplate("Password Changed", contentHTML, "Secure your account if this was unauthorized.");

  await transporter.sendMail({
    from: '"iGrow Big" <hello@arbilo.com>',
    to,
    subject: "Your Password Has Been Changed",
    html,
  });
};

// Updated: Send Forgot Password Reset Link Email
const sendResetPasswordEmail = async (to, resetLink, name = "User") => {
  try {
    console.log(`[Reset Email] Preparing for ${to} (Name: ${name})`);
    console.log(`[Reset Email] Link: ${resetLink}`); // Check if link is valid

    // Validate inputs (prevent silent fails)
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new Error("Invalid 'to' email address");
    }
    if (!resetLink || !resetLink.startsWith('http')) {
      throw new Error("Invalid resetLink - must be a valid URL");
    }

    const contentHTML = `
      <p class="paragraph">Hello ${name},</p>
      <p class="paragraph">We received a request to reset your password. Click the button below to proceed.</p>
      <p class="paragraph">This link will expire in 1 hour for security reasons.</p>
      <a href="${resetLink}" class="button">Reset Password</a>
      <p class="paragraph">If you didn't request this, ignore this email.</p>
      <p class="paragraph">Regards,<br>The iGrow Big Team</p>
    `;

    const html = generateEmailTemplate("Reset Your Password", contentHTML);

    const mailOptions = {
      from: '"iGrow Big" <hello@arbilo.com>',
      to,
      subject: "Password Reset Request",
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Reset Email] Sent Successfully! MessageID: ${info.messageId}`);
    console.log(`[Reset Email] Response:`, info.response); // SMTP2GO response
    return info;
  } catch (err) {
    console.error(`[Reset Email] Failed for ${to}:`, err.message);
    console.error(`[Reset Email] Stack:`, err.stack);
    // Log SMTP2GO-specific errors (e.g., auth fail, spam)
    if (err.response) console.error(`[Reset Email] SMTP Response:`, err.response);
    // Don't re-throw: Security - don't leak to user
  }
};
/**
  Send domain verification notification emails (kept as-is, but minor fixes for consistency)
 */
const sendDomainNotification = async (email, domain, status, instructions = null) => {
  try {
    // ========== STEP 1: VALIDATE EMAIL ==========
    if (!email) {
      console.error(`No email provided for domain notification: ${domain}`);
      return { success: false, error: "No email address provided" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`Invalid email format: ${email} for domain: ${domain}`);
      return { success: false, error: "Invalid email format" };
    }

    // ========== STEP 2: GET CONFIGURATION ==========
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    const serverIP = process.env.SERVER_IP || "139.59.8.68";
    const supportEmail = process.env.SUPPORT_EMAIL || "igrowbignetwork@gmail.com";

    console.log(`Preparing domain notification email:`);
    console.log(`   To: ${email}`);
    console.log(`   Domain: ${domain}`);
    console.log(`   Status: ${status}`);

    let subject, htmlContent;

    // ========== STEP 3: BUILD EMAIL CONTENT ==========
    switch (status) {
      case "pending":
        subject = `Set Up Your Custom Domain: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #333;">Custom Domain Setup Started</h2>
            <p>Hi there,</p>
            <p>You've requested to connect <strong>${domain}</strong> to your store. Follow these steps to complete the setup:</p>
            <div style="${stepStyle}">
              <h3 style="color: #4CAF50; margin-top: 0;">Step 1: Verify Domain Ownership (Required First)</h3>
              <p>Add this TXT record to your DNS provider to prove you own the domain:</p>
              <div style="${codeStyle}">
                <strong>Type:</strong> TXT<br>
                <strong>Name/Host:</strong> _igrowbig-verification.${domain}<br>
                <strong>Value:</strong> ${instructions?.step1?.value || instructions?.token || 'Check your dashboard'}<br>
                <strong>TTL:</strong> 3600 (or Automatic)
              </div>
              <p><small>DNS propagation usually takes 1-5 minutes, but can take up to 48 hours.</small></p>
            </div>
            <div style="${stepStyle}">
              <h3 style="color: #2196F3; margin-top: 0;">Step 2: Point Your Domain (After Verification)</h3>
              <p><strong>Option A: CNAME Record (Recommended)</strong></p>
              <div style="${codeStyle}">
                <strong>Type:</strong> CNAME<br>
                <strong>Name/Host:</strong> ${domain.replace(/^www\./, '')} ${domain.startsWith('www.') ? '(remove www)' : '(or @ for root)'}<br>
                <strong>Value:</strong> ${baseDomain}<br>
                <strong>TTL:</strong> 3600 (or Automatic)
              </div>
              <p style="margin-top: 20px;"><strong>Option B: A Record (If CNAME doesn't work)</strong></p>
              <div style="${codeStyle}">
                <strong>Type:</strong> A<br>
                <strong>Name/Host:</strong> @ (or ${domain})<br>
                <strong>Value:</strong> ${serverIP}<br>
                <strong>TTL:</strong> 3600 (or Automatic)
              </div>
            </div>
            <div style="background-color: #fff3cd; padding: 16px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <h4 style="margin-top: 0;">Important Notes:</h4>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Complete Step 1 first - we'll verify automatically</li>
                <li>After verification, add Step 2 records</li>
                <li>DNS changes can take up to 48 hours to propagate globally</li>
                <li>You'll receive a confirmation email once verified</li>
              </ul>
            </div>
            <h3>Need Help?</h3>
            <p>Common DNS providers setup guides:</p>
            <ul>
              <li><a href="https://www.godaddy.com/help/add-a-txt-record-19232">GoDaddy</a></li>
              <li><a href="https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain">Namecheap</a></li>
              <li><a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html">AWS Route 53</a></li>
              <li><a href="https://support.cloudflare.com/hc/en-us/articles/360019093151">Cloudflare</a></li>
            </ul>
            <p>Questions? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 30px;">Best regards,<br><strong>iGrow Big Team</strong></p>
          </div>
        `;
        break;

      case "verified":
        subject = `Your Domain ${domain} is Live!`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #4CAF50;">Domain Successfully Verified!</h2>
            <p>Great news! Your custom domain <strong>${domain}</strong> is now live and active.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://${domain}" style="${buttonStyle}">Visit Your Store →</a>
            </div>
            <div style="${stepStyle}">
              <h3 style="margin-top: 0;">What's Working:</h3>
              <ul>
                <li>Domain ownership verified</li>
                <li>DNS records configured correctly</li>
                <li>SSL certificate active (https)</li>
                <li>Your store is accessible at <a href="https://${domain}">https://${domain}</a></li>
              </ul>
            </div>
            <div style="background-color: #e8f5e9; padding: 16px; border-left: 4px solid #4CAF50; margin: 20px 0;">
              <h4 style="margin-top: 0;">Next Steps:</h4>
              <ul style="margin: 10px 0;">
                <li>Update your marketing materials with your new domain</li>
                <li>Set up email forwarding for your domain (optional)</li>
                <li>Share your store with customers!</li>
              </ul>
            </div>
            <p>Need help? We're here: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 30px;">Congratulations!<br><strong>iGrow Big Team</strong></p>
          </div>
        `;
        break;

      case "unverified":
        subject = `Domain Verification Failed: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #f44336;">Domain Verification Unsuccessful</h2>
            <p>We couldn't verify your domain <strong>${domain}</strong>.</p>
            <div style="background-color: #ffebee; padding: 16px; border-left: 4px solid #f44336; margin: 20px 0;">
              <h4 style="margin-top: 0;">Possible Issues:</h4>
              <ul style="margin: 10px 0;">
                <li>TXT record not added or incorrect value</li>
                <li>DNS changes haven't propagated yet (can take up to 48 hours)</li>
                <li>Records added to wrong domain/subdomain</li>
                <li>Typo in the verification token</li>
              </ul>
            </div>
            <div style="${stepStyle}">
              <h3 style="margin-top: 0;">How to Fix:</h3>
              <p><strong>1. Double-check your TXT record:</strong></p>
              <div style="${codeStyle}">
                <strong>Name/Host:</strong> _igrowbig-verification.${domain}<br>
                <strong>Value:</strong> ${instructions?.step1?.value || instructions?.token || 'Check your dashboard'}<br>
              </div>
              <p style="margin-top: 20px;"><strong>2. Verify DNS propagation:</strong></p>
              <p>Use <a href="https://www.whatsmydns.net/#TXT/_igrowbig-verification.${domain}" target="_blank">WhatsMyDNS.net</a> to check if your TXT record is visible globally.</p>
              <p style="margin-top: 20px;"><strong>3. Common mistakes to avoid:</strong></p>
              <ul>
                <li>Don't add quotes around the TXT value</li>
                <li>Make sure there are no extra spaces</li>
                <li>Add the record to the root domain, not a subdomain</li>
              </ul>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://${baseDomain}/settings" style="${buttonStyle}">Try Again in Dashboard →</a>
            </div>
            <p>Still stuck? We're here to help: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 30px;">Best regards,<br><strong>iGrow Big Team</strong></p>
          </div>
        `;
        break;

      case "partially_verified":
        subject = `Domain Ownership Verified - Finish Setup: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #ff9800;">Almost There!</h2>
            <p>Good news! You've successfully verified ownership of <strong>${domain}</strong>.</p>
            <p>However, your domain isn't pointing to our platform yet.</p>
            <div style="background-color: #fff3cd; padding: 16px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <h4 style="margin-top: 0;">Completed:</h4>
              <p>TXT record verified - domain ownership confirmed</p>
              <h4 style="margin-top: 20px;">Remaining:</h4>
              <p>Add CNAME or A record to point your domain to our servers</p>
            </div>
            <div style="${stepStyle}">
              <h3 style="margin-top: 0;">Complete Setup Now:</h3>
              <p><strong>Option A: CNAME Record (Recommended)</strong></p>
              <div style="${codeStyle}">
                <strong>Type:</strong> CNAME<br>
                <strong>Name/Host:</strong> ${domain.replace(/^www\./, '')} (or @)<br>
                <strong>Value:</strong> ${baseDomain}<br>
                <strong>TTL:</strong> 3600
              </div>
              <p style="margin-top: 20px;"><strong>Option B: A Record</strong></p>
              <div style="${codeStyle}">
                <strong>Type:</strong> A<br>
                <strong>Name/Host:</strong> @ (or ${domain})<br>
                <strong>Value:</strong> ${serverIP}<br>
                <strong>TTL:</strong> 3600
              </div>
            </div>
            <p>Once added, your domain will be live within a few minutes!</p>
            <p>Questions? <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 30px;">Best regards,<br><strong>iGrow Big Team</strong></p>
          </div>
        `;
        break;

      default:
        subject = `Domain Update: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2>Domain Status Update</h2>
            <p>Your domain <strong>${domain}</strong> status has been updated.</p>
            <p>Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a> for more information.</p>
            <p>Best regards,<br><strong>iGrow Big Team</strong></p>
          </div>
        `;
    }

    // ========== STEP 4: SEND EMAIL ==========
    const mailOptions = {
      from: '"iGrow Big" <hello@arbilo.com>',  // Hardcoded to avoid SMTP_USER issues
      to: email,
      subject: subject,
      html: htmlContent,
    };

    console.log(`Sending email to ${email}...`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`Email sent successfully!`);
    console.log(`   MessageID: ${info.messageId}`);
    console.log(`   To: ${email}`);
    console.log(`   Subject: ${subject}`);

    return { 
      success: true, 
      messageId: info.messageId,
      email: email,
      status: status
    };

  } catch (error) {
    console.error(`Failed to send domain notification email:`);
    console.error(`   To: ${email}`);
    console.error(`   Domain: ${domain}`);
    console.error(`   Status: ${status}`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    // Don't throw - return error info
    return {
      success: false,
      error: error.message,
      email: email,
      domain: domain
    };
  }
};

module.exports = {
  transporter,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangeEmail,  // Added
  sendResetPasswordEmail,   // Added for forgot flow
  sendNewsletterSubscriptionEmail,
  sendDomainNotification
};