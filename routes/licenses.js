const express = require('express');
const router = express.Router();
const {
    generateLicenseKey,
    signLicense,
    verifyLicenseSignature,
    encryptLicense,
    hashDeviceId
} = require('../utils/crypto');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// Load RSA keys (we'll generate these on first run)
let privateKey, publicKey;

function loadKeys() {
    const keysDir = path.join(__dirname, '../data/keys');
    const privateKeyPath = path.join(keysDir, 'private.pem');
    const publicKeyPath = path.join(keysDir, 'public.pem');

    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
        privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    } else {
        const { generateKeyPair } = require('../utils/crypto');
        const keys = generateKeyPair();
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
        fs.writeFileSync(privateKeyPath, privateKey);
        fs.writeFileSync(publicKeyPath, publicKey);
        console.log('✅ Generated new RSA key pair');
    }
}

loadKeys();

module.exports = (db) => {
    // Generate new license (admin only)
    router.post('/generate', authenticateToken, (req, res) => {
        try {
            const {
                kioskName,
                location,
                country = 'UK',
                validityDays
            } = req.body;

            if (!kioskName) {
                return res.status(400).json({ error: 'Kiosk name is required' });
            }

            // Generate license key
            const licenseKey = generateLicenseKey('KFC-KIO', country);

            // Calculate dates
            const issuedAt = new Date().toISOString();
            const validity = validityDays || parseInt(process.env.LICENSE_VALIDITY_DAYS) || 365;
            const expiresAt = new Date(Date.now() + validity * 24 * 60 * 60 * 1000).toISOString();

            const licenseData = {
                licenseKey,
                kioskName,
                location: location || {},
                issuedAt,
                expiresAt
            };

            // Save to database
            db.createLicense(licenseData);

            // Log activity
            db.logActivity({
                userId: req.user.id,
                action: 'generate_license',
                resourceType: 'license',
                resourceId: licenseKey,
                details: JSON.stringify({ kioskName, location }),
                ipAddress: req.ip
            });

            res.json({
                success: true,
                license: {
                    licenseKey,
                    kioskName,
                    location: licenseData.location,
                    status: 'pending',
                    issuedAt,
                    expiresAt
                }
            });
        } catch (error) {
            console.error('License generation error:', error);
            res.status(500).json({ error: 'Failed to generate license' });
        }
    });

    // Activate license (kiosk calls this)
    router.post('/activate', async (req, res) => {
        try {
            const { licenseKey, deviceId, kioskInfo } = req.body;

            if (!licenseKey || !deviceId) {
                return res.status(400).json({ error: 'License key and device ID required' });
            }

            // Get license
            const license = db.getLicenseByKey(licenseKey);

            if (!license) {
                db.logValidation({
                    licenseKey,
                    deviceIdHash: hashDeviceId(deviceId),
                    validationType: 'activation',
                    success: false,
                    errorMessage: 'License key not found',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(404).json({ error: 'License key not found' });
            }

            // Check if already activated
            if (license.status === 'active' && license.device_id_hash) {
                const deviceHash = hashDeviceId(deviceId);

                // Check if same device
                if (license.device_id_hash === deviceHash) {
                    // Same device, return existing license
                    const licenseResponse = {
                        licenseKey: license.license_key,
                        deviceId: deviceHash,
                        kioskName: license.kiosk_name,
                        activatedAt: license.activated_at,
                        expiresAt: license.expires_at,
                        lastValidated: license.last_validated_at,
                        graceExpiresAt: new Date(
                            new Date(license.last_validated_at).getTime() +
                            90 * 24 * 60 * 60 * 1000
                        ).toISOString()
                    };

                    const signature = signLicense(licenseResponse, privateKey);

                    return res.json({
                        success: true,
                        license: { ...licenseResponse, signature }
                    });
                } else {
                    // Different device
                    db.logValidation({
                        licenseKey,
                        deviceIdHash: deviceHash,
                        validationType: 'activation',
                        success: false,
                        errorMessage: 'License already activated on another device',
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    });

                    return res.status(403).json({
                        error: 'License already activated on another device'
                    });
                }
            }

            // Check if revoked
            if (license.status === 'revoked') {
                db.logValidation({
                    licenseKey,
                    deviceIdHash: hashDeviceId(deviceId),
                    validationType: 'activation',
                    success: false,
                    errorMessage: 'License has been revoked',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(403).json({
                    error: 'License has been revoked',
                    reason: license.revoke_reason
                });
            }

            // Check if expired
            if (new Date(license.expires_at) < new Date()) {
                db.logValidation({
                    licenseKey,
                    deviceIdHash: hashDeviceId(deviceId),
                    validationType: 'activation',
                    success: false,
                    errorMessage: 'License has expired',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(403).json({ error: 'License has expired' });
            }

            // Activate license
            const deviceHash = hashDeviceId(deviceId);
            db.activateLicense(licenseKey, deviceHash);

            // Create license response
            const licenseResponse = {
                licenseKey: license.license_key,
                deviceId: deviceHash,
                kioskName: license.kiosk_name,
                location: {
                    restaurant: license.location_restaurant,
                    country: license.location_country,
                    region: license.location_region
                },
                activatedAt: new Date().toISOString(),
                expiresAt: license.expires_at,
                lastValidated: new Date().toISOString(),
                graceExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            };

            // Sign license
            const signature = signLicense(licenseResponse, privateKey);

            // Log validation
            db.logValidation({
                licenseKey,
                deviceIdHash: deviceHash,
                validationType: 'activation',
                success: true,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.json({
                success: true,
                license: {
                    ...licenseResponse,
                    signature
                }
            });
        } catch (error) {
            console.error('License activation error:', error);
            res.status(500).json({ error: 'Activation failed' });
        }
    });

    // Validate license (periodic check)
    router.post('/validate', async (req, res) => {
        try {
            const { licenseKey, deviceId } = req.body;

            if (!licenseKey || !deviceId) {
                return res.status(400).json({ error: 'License key and device ID required' });
            }

            const license = db.getLicenseByKey(licenseKey);

            if (!license) {
                db.logValidation({
                    licenseKey,
                    deviceIdHash: hashDeviceId(deviceId),
                    validationType: 'periodic',
                    success: false,
                    errorMessage: 'License key not found',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(404).json({ error: 'License not found' });
            }

            // Check device ID
            const deviceHash = hashDeviceId(deviceId);
            if (license.device_id_hash !== deviceHash) {
                db.logValidation({
                    licenseKey,
                    deviceIdHash,
                    validationType: 'periodic',
                    success: false,
                    errorMessage: 'Device ID mismatch',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(403).json({ error: 'Device ID mismatch' });
            }

            // Check if revoked
            if (license.status === 'revoked') {
                db.logValidation({
                    licenseKey,
                    deviceIdHash,
                    validationType: 'periodic',
                    success: false,
                    errorMessage: 'License has been revoked',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(403).json({
                    error: 'License has been revoked',
                    reason: license.revoke_reason
                });
            }

            // Check if expired
            if (new Date(license.expires_at) < new Date()) {
                db.logValidation({
                    licenseKey,
                    deviceIdHash,
                    validationType: 'periodic',
                    success: false,
                    errorMessage: 'License has expired',
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });

                return res.status(403).json({ error: 'License has expired' });
            }

            // Update validation timestamp
            db.updateValidation(licenseKey);

            // Log validation
            db.logValidation({
                licenseKey,
                deviceIdHash,
                validationType: 'periodic',
                success: true,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.json({
                valid: true,
                validatedAt: new Date().toISOString(),
                expiresAt: license.expires_at
            });
        } catch (error) {
            console.error('License validation error:', error);
            res.status(500).json({ error: 'Validation failed' });
        }
    });

    // Generate offline license file (admin only)
    router.post('/generate-offline', authenticateToken, (req, res) => {
        try {
            const { licenseKey, deviceId } = req.body;

            if (!licenseKey || !deviceId) {
                return res.status(400).json({ error: 'License key and device ID required' });
            }

            const license = db.getLicenseByKey(licenseKey);

            if (!license) {
                return res.status(404).json({ error: 'License not found' });
            }

            // Create license data
            const licenseData = {
                licenseKey: license.license_key,
                deviceId: hashDeviceId(deviceId),
                kioskName: license.kiosk_name,
                location: {
                    restaurant: license.location_restaurant,
                    country: license.location_country,
                    region: license.location_region
                },
                issuedAt: license.issued_at,
                expiresAt: license.expires_at,
                activatedAt: new Date().toISOString(),
                lastValidated: new Date().toISOString(),
                graceExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            };

            // Sign license
            const signature = signLicense(licenseData, privateKey);

            // Encrypt for device
            const encrypted = encryptLicense({ ...licenseData, signature }, deviceId);

            // Log activity
            db.logActivity({
                userId: req.user.id,
                action: 'generate_offline_license',
                resourceType: 'license',
                resourceId: licenseKey,
                details: `Device ID: ${deviceId.substring(0, 8)}...`,
                ipAddress: req.ip
            });

            res.json({
                success: true,
                licenseFile: encrypted,
                licenseData: { ...licenseData, signature }
            });
        } catch (error) {
            console.error('Offline license generation error:', error);
            res.status(500).json({ error: 'Failed to generate offline license' });
        }
    });

    // Get all licenses (admin only)
    router.get('/all', authenticateToken, async (req, res) => {
        try {
            const { status, country, limit } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (country) filters.country = country;
            if (limit) filters.limit = parseInt(limit);

            const licenses = await db.getAllLicenses(filters);

            res.json({
                success: true,
                licenses: licenses.map(l => ({
                    licenseKey: l.license_key,
                    kioskName: l.kiosk_name,
                    location: {
                        restaurant: l.location_restaurant,
                        country: l.location_country,
                        region: l.location_region
                    },
                    status: l.status,
                    issuedAt: l.issued_at,
                    expiresAt: l.expires_at,
                    activatedAt: l.activated_at,
                    lastValidatedAt: l.last_validated_at,
                    revokedAt: l.revoked_at,
                    revokeReason: l.revoke_reason
                }))
            });
        } catch (error) {
            console.error('Error fetching licenses:', error);
            res.status(500).json({ error: 'Failed to fetch licenses' });
        }
    });

    // Get license details (admin only)
    router.get('/:licenseKey', authenticateToken, (req, res) => {
        try {
            const license = db.getLicenseByKey(req.params.licenseKey);

            if (!license) {
                return res.status(404).json({ error: 'License not found' });
            }

            // Get validation logs
            const validations = db.getValidationLogs(req.params.licenseKey, 20);

            res.json({
                success: true,
                license: {
                    licenseKey: license.license_key,
                    kioskName: license.kiosk_name,
                    location: {
                        restaurant: license.location_restaurant,
                        country: license.location_country,
                        region: license.location_region
                    },
                    status: license.status,
                    deviceIdHash: license.device_id_hash,
                    issuedAt: license.issued_at,
                    expiresAt: license.expires_at,
                    activatedAt: license.activated_at,
                    lastValidatedAt: license.last_validated_at,
                    revokedAt: license.revoked_at,
                    revokeReason: license.revoke_reason
                },
                validations
            });
        } catch (error) {
            console.error('Error fetching license:', error);
            res.status(500).json({ error: 'Failed to fetch license' });
        }
    });

    // Revoke license (admin only)
    router.post('/:licenseKey/revoke', authenticateToken, (req, res) => {
        try {
            const { reason } = req.body;

            if (!reason) {
                return res.status(400).json({ error: 'Revocation reason required' });
            }

            const license = db.getLicenseByKey(req.params.licenseKey);

            if (!license) {
                return res.status(404).json({ error: 'License not found' });
            }

            db.revokeLicense(req.params.licenseKey, reason);

            // Log activity
            db.logActivity({
                userId: req.user.id,
                action: 'revoke_license',
                resourceType: 'license',
                resourceId: req.params.licenseKey,
                details: `Reason: ${reason}`,
                ipAddress: req.ip
            });

            res.json({
                success: true,
                message: 'License revoked successfully'
            });
        } catch (error) {
            console.error('Error revoking license:', error);
            res.status(500).json({ error: 'Failed to revoke license' });
        }
    });

    // Delete license (admin only)
    router.delete('/:licenseKey', authenticateToken, (req, res) => {
        try {
            const license = db.getLicenseByKey(req.params.licenseKey);

            if (!license) {
                return res.status(404).json({ error: 'License not found' });
            }

            db.deleteLicense(req.params.licenseKey);

            // Log activity
            db.logActivity({
                userId: req.user.id,
                action: 'delete_license',
                resourceType: 'license',
                resourceId: req.params.licenseKey,
                ipAddress: req.ip
            });

            res.json({
                success: true,
                message: 'License deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting license:', error);
            res.status(500).json({ error: 'Failed to delete license' });
        }
    });

    // Get public key (for SDK to verify signatures)
    router.get('/keys/public', (req, res) => {
        res.type('text/plain').send(publicKey);
    });

    // Get statistics (admin only)
    router.get('/stats/dashboard', authenticateToken, (req, res) => {
        try {
            const stats = db.getStats();
            res.json({ success: true, stats });
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.status(500).json({ error: 'Failed to fetch statistics' });
        }
    });

    return router;
};

