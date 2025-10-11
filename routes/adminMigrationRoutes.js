/**
 * Admin Migration Routes
 * Location: D:\NHT GLOBAL\back\routes\adminMigrationRoutes.js
 * 
 * Endpoints for managing domain verification tokens and email testing
 */

const express = require('express');
const router = express.Router();
const { migrateTokens, updateSingleToken } = require('../utils/tokenMigration');
const { sendDomainNotification } = require('../config/email');
const db = require('../config/db');
const crypto = require('crypto');
const { authenticateAdmin } = require('../middleware/authMiddleware');

/**
 * POST /api/admin/migrate-tokens
 * Migrate all old format tokens to new format and resend emails
 */
router.post('/migrate-tokens', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔄 Admin triggered token migration');
    
    const result = await migrateTokens();
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Migrated ${result.migrated} tokens, sent ${result.emails_sent} emails`
        : 'Migration failed',
      data: result
    });
  } catch (error) {
    console.error('Migration endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/resend-domain-email/:tenantId
 * Resend domain verification email for a specific tenant
 */
router.post('/resend-domain-email/:tenantId', authenticateAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    console.log(`📧 Resending domain email for tenant ${tenantId}`);
    
    // Get verification data
    const verification = await db.selectAll(
      'tbl_domain_verifications',
      '*',
      'tenant_id = ?',
      [tenantId]
    );
    
    if (!verification || verification.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification record found'
      });
    }
    
    const verificationData = verification[0];
    
    // Get email
    const settings = await db.selectAll(
      'tbl_settings',
      'email_id',
      'tenant_id = ?',
      [tenantId]
    );
    
    let userEmail = settings[0]?.email_id;
    
    if (!userEmail) {
      const user = await db.selectAll(
        'tbl_users',
        'email',
        'tenant_id = ?',
        [tenantId]
      );
      userEmail = user[0]?.email;
    }
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'No email address found for this tenant'
      });
    }
    
    // Prepare instructions
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || 'igrowbig.com';
    const serverIP = process.env.SERVER_IP || '139.59.8.68';
    
    const instructions = {
      token: verificationData.verification_token,
      step1: {
        type: 'TXT Record',
        name: `_igrowbig-verification.${verificationData.domain}`,
        value: verificationData.verification_token,
        ttl: '3600',
      },
      step2: {
        type: 'CNAME/A Record',
        cname: {
          name: verificationData.domain.replace(/^www\./, ''),
          value: baseDomain,
        },
        a_record: {
          name: '@',
          value: serverIP,
        },
      },
    };
    
    // Send email
    const emailResult = await sendDomainNotification(
      userEmail,
      verificationData.domain,
      verificationData.verification_status,
      instructions
    );
    
    if (emailResult.success) {
      res.json({
        success: true,
        message: `Email sent to ${userEmail}`,
        data: {
          email: userEmail,
          domain: verificationData.domain,
          token: verificationData.verification_token,
          messageId: emailResult.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: emailResult.error,
        email: userEmail
      });
    }
    
  } catch (error) {
    console.error('Resend email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/update-domain-token/:tenantId
 * Update verification token for a specific tenant
 */
router.put('/update-domain-token/:tenantId', authenticateAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { token, resendEmail } = req.body;
    
    console.log(`🔄 Updating token for tenant ${tenantId}`);
    
    // Update token
    const result = await updateSingleToken(tenantId, token);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    // Optionally resend email
    if (resendEmail) {
      const verification = await db.selectAll(
        'tbl_domain_verifications',
        '*',
        'tenant_id = ?',
        [tenantId]
      );
      
      if (verification.length > 0) {
        const settings = await db.selectAll(
          'tbl_settings',
          'email_id',
          'tenant_id = ?',
          [tenantId]
        );
        
        let userEmail = settings[0]?.email_id;
        
        if (!userEmail) {
          const user = await db.selectAll(
            'tbl_users',
            'email',
            'tenant_id = ?',
            [tenantId]
          );
          userEmail = user[0]?.email;
        }
        
        if (userEmail) {
          const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || 'igrowbig.com';
          const serverIP = process.env.SERVER_IP || '139.59.8.68';
          
          const instructions = {
            token: result.token,
            step1: {
              value: result.token
            }
          };
          
          await sendDomainNotification(
            userEmail,
            verification[0].domain,
            'pending',
            instructions
          );
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Token updated successfully',
      token: result.token,
      emailSent: !!resendEmail
    });
    
  } catch (error) {
    console.error('Update token error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/domain-verifications
 * List all domain verifications with their status
 */
router.get('/domain-verifications', authenticateAdmin, async (req, res) => {
  try {
    const verifications = await db.queryAll(`
      SELECT 
        dv.tenant_id,
        dv.domain,
        dv.verification_token,
        dv.verification_status,
        dv.verification_method,
        dv.created_at,
        dv.last_check_at,
        dv.verified_at,
        COALESCE(s.email_id, u.email) as email,
        t.store_name,
        CASE 
          WHEN dv.verification_token LIKE 'igrow-%' THEN 'new'
          ELSE 'old'
        END as token_format,
        LENGTH(dv.verification_token) as token_length
      FROM tbl_domain_verifications dv
      LEFT JOIN tbl_settings s ON dv.tenant_id = s.tenant_id
      LEFT JOIN tbl_users u ON dv.tenant_id = u.tenant_id
      LEFT JOIN tbl_tenants t ON dv.tenant_id = t.id
      ORDER BY dv.created_at DESC
    `);
    
    res.json({
      success: true,
      count: verifications.length,
      data: verifications
    });
    
  } catch (error) {
    console.error('List verifications error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/test-domain-email
 * Test email sending without modifying database
 */
router.post('/test-domain-email', async (req, res) => {
  try {
    const { email, domain, token } = req.body;
    
    if (!email || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Email and domain are required'
      });
    }
    
    const testToken = token || `igrow-${crypto.randomUUID()}`;
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || 'igrowbig.com';
    const serverIP = process.env.SERVER_IP || '139.59.8.68';
    
    const instructions = {
      token: testToken,
      step1: {
        type: 'TXT Record',
        name: `_igrowbig-verification.${domain}`,
        value: testToken,
        ttl: '3600',
      },
      step2: {
        type: 'CNAME/A Record',
        cname: {
          name: domain.replace(/^www\./, ''),
          value: baseDomain,
        },
        a_record: {
          name: '@',
          value: serverIP,
        },
      },
    };
    
    console.log(`🧪 Sending test email to ${email} for domain ${domain}`);
    
    const result = await sendDomainNotification(
      email,
      domain,
      'pending',
      instructions
    );
    
    res.json({
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
      data: result
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;