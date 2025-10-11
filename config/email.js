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
    console.error("❌ SMTP Verification Failed:", error);
    console.error("SMTP Config:", { host: smtpHost, port: smtpPort, user: smtpUser });
  } else {
    console.log("✅ SMTP Transporter is ready to send emails");
    console.log(`📧 Sending from: ${smtpUser}`);
  }
});

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

/**
  Send domain verification notification emails

 */
const sendDomainNotification = async (email, domain, status, instructions = null) => {
  try {
    // ========== STEP 1: VALIDATE EMAIL ==========
    if (!email) {
      console.error(`❌ No email provided for domain notification: ${domain}`);
      return { success: false, error: "No email address provided" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`❌ Invalid email format: ${email} for domain: ${domain}`);
      return { success: false, error: "Invalid email format" };
    }

    // ========== STEP 2: GET CONFIGURATION ==========
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    const serverIP = process.env.SERVER_IP || "139.59.8.68";
    const supportEmail = process.env.SUPPORT_EMAIL || "support@igrowbig.com";

    console.log(`📧 Preparing domain notification email:`);
    console.log(`   To: ${email}`);
    console.log(`   Domain: ${domain}`);
    console.log(`   Status: ${status}`);

    let subject, htmlContent;

    // ========== STEP 3: BUILD EMAIL CONTENT ==========
    switch (status) {
      case "pending":
        subject = `🔍 Set Up Your Custom Domain: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #333;">🚀 Custom Domain Setup Started</h2>
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
              <p><small>⏱️ DNS propagation usually takes 1-5 minutes, but can take up to 48 hours.</small></p>
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
              <h4 style="margin-top: 0;">📝 Important Notes:</h4>
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
        subject = `✅ Your Domain ${domain} is Live!`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #4CAF50;">🎉 Domain Successfully Verified!</h2>
            <p>Great news! Your custom domain <strong>${domain}</strong> is now live and active.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://${domain}" style="${buttonStyle}">Visit Your Store →</a>
            </div>
            <div style="${stepStyle}">
              <h3 style="margin-top: 0;">✅ What's Working:</h3>
              <ul>
                <li>Domain ownership verified</li>
                <li>DNS records configured correctly</li>
                <li>SSL certificate active (https)</li>
                <li>Your store is accessible at <a href="https://${domain}">https://${domain}</a></li>
              </ul>
            </div>
            <div style="background-color: #e8f5e9; padding: 16px; border-left: 4px solid #4CAF50; margin: 20px 0;">
              <h4 style="margin-top: 0;">🚀 Next Steps:</h4>
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
        subject = `❌ Domain Verification Failed: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #f44336;">❌ Domain Verification Unsuccessful</h2>
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
              <h3 style="margin-top: 0;">🔧 How to Fix:</h3>
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
        subject = `⚠️ Domain Ownership Verified - Finish Setup: ${domain}`;
        htmlContent = `
          <div style="${emailStyles}">
            <h2 style="color: #ff9800;">⚠️ Almost There!</h2>
            <p>Good news! You've successfully verified ownership of <strong>${domain}</strong>.</p>
            <p>However, your domain isn't pointing to our platform yet.</p>
            <div style="background-color: #fff3cd; padding: 16px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <h4 style="margin-top: 0;">✅ Completed:</h4>
              <p>TXT record verified - domain ownership confirmed</p>
              <h4 style="margin-top: 20px;">⏳ Remaining:</h4>
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

    console.log(`📤 Sending email to ${email}...`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent successfully!`);
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
    console.error(`❌ Failed to send domain notification email:`);
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
  sendNewsletterSubscriptionEmail,
  sendDomainNotification
};