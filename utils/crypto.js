const crypto = require('crypto');

/**
 * Generate a cryptographically secure license key
 */
function generateLicenseKey(prefix = 'KFC-KIO', country = 'UK') {
    const year = new Date().getFullYear();
    const segments = [];

    // Generate 4 random segments
    for (let i = 0; i < 4; i++) {
        const segment = crypto.randomBytes(2)
            .toString('hex')
            .toUpperCase()
            .substring(0, 4);
        segments.push(segment);
    }

    return `${prefix}-${country}-${year}-${segments.join('-')}`;
}

/**
 * Generate RSA key pair for signing licenses
 */
function generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
}

/**
 * Sign license data with private key
 */
function signLicense(licenseData, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(licenseData));
    sign.end();
    return sign.sign(privateKey, 'base64');
}

/**
 * Verify license signature with public key
 */
function verifyLicenseSignature(licenseData, signature, publicKey) {
    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(JSON.stringify(licenseData));
        verify.end();
        return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
        return false;
    }
}

/**
 * Encrypt license data for offline activation
 */
function encryptLicense(licenseData, deviceId) {
    // Derive key from device ID
    const key = crypto.pbkdf2Sync(deviceId, 'license-salt', 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(JSON.stringify(licenseData), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Hash device ID for storage
 */
function hashDeviceId(deviceId) {
    return crypto.createHash('sha256')
        .update(deviceId)
        .digest('hex');
}

module.exports = {
    generateLicenseKey,
    generateKeyPair,
    signLicense,
    verifyLicenseSignature,
    encryptLicense,
    hashDeviceId
};

