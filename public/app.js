// ===================================
// State Management
// ===================================
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  licenses: [],
  filteredLicenses: []
};

// ===================================
// API Client
// ===================================
const API_BASE = window.location.origin + '/api';

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });
  
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error('Authentication required');
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  
  return data;
}

// ===================================
// UI Utilities
// ===================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  
  // Focus first input
  const firstInput = modal.querySelector('input, select, textarea, button');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.classList.add('show');
}

function hideError(elementId) {
  const element = document.getElementById(elementId);
  element.classList.remove('show');
}

function setButtonLoading(button, loading) {
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// ===================================
// Authentication
// ===================================
async function login(username, password) {
  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    
    return true;
  } catch (error) {
    throw error;
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  showScreen('login-screen');
}

async function verifyToken() {
  if (!state.token) {
    return false;
  }
  
  try {
    const data = await apiRequest('/auth/verify');
    state.user = data.user;
    return true;
  } catch (error) {
    return false;
  }
}

// ===================================
// License Operations
// ===================================
async function fetchLicenses() {
  try {
    const data = await apiRequest('/licenses/all');
    state.licenses = data.licenses;
    state.filteredLicenses = data.licenses;
    renderLicenses();
    updateStats();
  } catch (error) {
    showToast('Error', 'Failed to fetch licenses', 'error');
  }
}

async function generateLicense(formData) {
  try {
    const data = await apiRequest('/licenses/generate', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    
    showToast('Success', `License generated: ${data.license.licenseKey}`, 'success');
    fetchLicenses();
    return data.license;
  } catch (error) {
    throw error;
  }
}

async function getLicenseDetails(licenseKey) {
  try {
    const data = await apiRequest(`/licenses/${licenseKey}`);
    return data;
  } catch (error) {
    throw error;
  }
}

async function revokeLicense(licenseKey, reason) {
  try {
    await apiRequest(`/licenses/${licenseKey}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    
    showToast('Success', 'License revoked successfully', 'success');
    fetchLicenses();
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function deleteLicense(licenseKey) {
  if (!confirm('Are you sure you want to delete this license? This action cannot be undone.')) {
    return;
  }
  
  try {
    await apiRequest(`/licenses/${licenseKey}`, {
      method: 'DELETE'
    });
    
    showToast('Success', 'License deleted successfully', 'success');
    fetchLicenses();
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function generateOfflineLicense(licenseKey, deviceId) {
  try {
    const data = await apiRequest('/licenses/generate-offline', {
      method: 'POST',
      body: JSON.stringify({ licenseKey, deviceId })
    });
    
    return data;
  } catch (error) {
    throw error;
  }
}

// ===================================
// Rendering
// ===================================
function renderLicenses() {
  const tbody = document.getElementById('licenses-tbody');
  
  if (state.filteredLicenses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">
          No licenses found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = state.filteredLicenses.map(license => `
    <tr>
      <td>
        <span class="license-key">${license.licenseKey}</span>
      </td>
      <td>${license.kioskName}</td>
      <td>
        ${license.location.restaurant || '-'}<br>
        <small style="color: var(--text-muted)">${license.location.country || ''} ${license.location.region || ''}</small>
      </td>
      <td>
        <span class="status-badge ${license.status}">
          ${license.status}
        </span>
      </td>
      <td>${formatDate(license.issuedAt)}</td>
      <td>${formatDate(license.expiresAt)}</td>
      <td>${license.lastValidatedAt ? formatDate(license.lastValidatedAt) : '-'}</td>
      <td>
        <div class="table-actions">
          <button 
            class="btn btn-sm btn-secondary" 
            onclick="viewLicenseDetails('${license.licenseKey}')"
            aria-label="View details for ${license.licenseKey}"
          >
            Details
          </button>
          ${license.status !== 'revoked' ? `
            <button 
              class="btn btn-sm btn-danger" 
              onclick="revokeLicense('${license.licenseKey}', 'Manual revocation')"
              aria-label="Revoke ${license.licenseKey}"
            >
              Revoke
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function viewLicenseDetails(licenseKey) {
  showModal('details-modal');
  
  const content = document.getElementById('license-details-content');
  content.innerHTML = '<div class="loading-spinner" aria-label="Loading..."></div>';
  
  try {
    const data = await getLicenseDetails(licenseKey);
    const license = data.license;
    
    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">License Key</div>
          <div class="detail-value mono">${license.licenseKey}</div>
        </div>
        
        <div class="detail-item">
          <div class="detail-label">Status</div>
          <div class="detail-value">
            <span class="status-badge ${license.status}">${license.status}</span>
          </div>
        </div>
        
        <div class="detail-item">
          <div class="detail-label">Kiosk Name</div>
          <div class="detail-value">${license.kioskName}</div>
        </div>
        
        ${license.location.restaurant ? `
          <div class="detail-item">
            <div class="detail-label">Restaurant</div>
            <div class="detail-value">${license.location.restaurant}</div>
          </div>
        ` : ''}
        
        <div class="detail-item">
          <div class="detail-label">Location</div>
          <div class="detail-value">${license.location.country || '-'}, ${license.location.region || '-'}</div>
        </div>
        
        ${license.deviceIdHash ? `
          <div class="detail-item">
            <div class="detail-label">Device ID (Hash)</div>
            <div class="detail-value mono">${license.deviceIdHash.substring(0, 16)}...</div>
          </div>
        ` : ''}
        
        <div class="detail-item">
          <div class="detail-label">Issued</div>
          <div class="detail-value">${formatDate(license.issuedAt)}</div>
        </div>
        
        <div class="detail-item">
          <div class="detail-label">Expires</div>
          <div class="detail-value">${formatDate(license.expiresAt)}</div>
        </div>
        
        ${license.activatedAt ? `
          <div class="detail-item">
            <div class="detail-label">Activated</div>
            <div class="detail-value">${formatDate(license.activatedAt)}</div>
          </div>
        ` : ''}
        
        ${license.lastValidatedAt ? `
          <div class="detail-item">
            <div class="detail-label">Last Validated</div>
            <div class="detail-value">${formatDate(license.lastValidatedAt)}</div>
          </div>
        ` : ''}
        
        ${license.revokedAt ? `
          <div class="detail-item">
            <div class="detail-label">Revoked</div>
            <div class="detail-value">${formatDate(license.revokedAt)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Revoke Reason</div>
            <div class="detail-value">${license.revokeReason || '-'}</div>
          </div>
        ` : ''}
      </div>
      
      ${license.status === 'pending' ? `
        <div style="margin-top: var(--spacing-lg); padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--border-radius);">
          <h3 style="margin-bottom: var(--spacing-sm);">Offline Activation</h3>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: var(--spacing-md);">
            To activate this license offline, you need the device ID from the kiosk.
          </p>
          <div class="form-group">
            <label for="device-id-input">Device ID</label>
            <input type="text" id="device-id-input" placeholder="Enter device ID from kiosk">
          </div>
          <button class="btn btn-primary" onclick="generateOfflineFile('${license.licenseKey}')">
            Generate Offline License File
          </button>
        </div>
      ` : ''}
      
      ${data.validations && data.validations.length > 0 ? `
        <div style="margin-top: var(--spacing-lg);">
          <h3 style="margin-bottom: var(--spacing-md);">Recent Validations</h3>
          <div style="max-height: 300px; overflow-y: auto;">
            <table class="licenses-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Success</th>
                  <th>Date</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${data.validations.map(v => `
                  <tr>
                    <td>${v.validation_type}</td>
                    <td>
                      <span class="status-badge ${v.success ? 'active' : 'revoked'}">
                        ${v.success ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>${formatDate(v.created_at)}</td>
                    <td>${v.ip_address || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
      
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('details-modal')">Close</button>
        ${license.status !== 'revoked' ? `
          <button class="btn btn-danger" onclick="revokeLicense('${license.licenseKey}', 'Revoked via details modal'); closeModal('details-modal')">
            Revoke License
          </button>
        ` : ''}
      </div>
    `;
  } catch (error) {
    content.innerHTML = `
      <div style="text-align: center; padding: var(--spacing-xl); color: var(--danger-color);">
        <p>Failed to load license details</p>
        <p style="font-size: 0.875rem; margin-top: var(--spacing-sm);">${error.message}</p>
        <button class="btn btn-secondary" onclick="closeModal('details-modal')" style="margin-top: var(--spacing-md)">
          Close
        </button>
      </div>
    `;
  }
}

async function generateOfflineFile(licenseKey) {
  const deviceIdInput = document.getElementById('device-id-input');
  const deviceId = deviceIdInput.value.trim();
  
  if (!deviceId) {
    showToast('Error', 'Please enter a device ID', 'error');
    return;
  }
  
  try {
    const data = await generateOfflineLicense(licenseKey, deviceId);
    
    // Create downloadable file
    const licenseData = JSON.stringify(data.licenseData, null, 2);
    const blob = new Blob([licenseData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-${licenseKey}.lic`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Success', 'License file downloaded', 'success');
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

function updateStats() {
  const active = state.licenses.filter(l => l.status === 'active').length;
  const pending = state.licenses.filter(l => l.status === 'pending').length;
  const revoked = state.licenses.filter(l => l.status === 'revoked').length;
  
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-total').textContent = state.licenses.length;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-revoked').textContent = revoked;
}

function filterLicenses(searchTerm, status) {
  state.filteredLicenses = state.licenses.filter(license => {
    const matchesSearch = !searchTerm || 
      license.licenseKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      license.kioskName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (license.location.restaurant && license.location.restaurant.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = !status || license.status === status;
    
    return matchesSearch && matchesStatus;
  });
  
  renderLicenses();
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ===================================
// Event Listeners
// ===================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const isAuthenticated = await verifyToken();
  
  if (isAuthenticated) {
    showScreen('dashboard-screen');
    document.getElementById('username-display').textContent = state.user.username;
    fetchLicenses();
  } else {
    showScreen('login-screen');
  }
  
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true);
    
    const username = form.username.value;
    const password = form.password.value;
    
    try {
      await login(username, password);
      showScreen('dashboard-screen');
      document.getElementById('username-display').textContent = username;
      fetchLicenses();
    } catch (error) {
      showError('login-error', error.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
  
  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // Generate license button
  document.getElementById('generate-license-btn').addEventListener('click', () => {
    showModal('generate-modal');
    document.getElementById('generate-form').reset();
    hideError('generate-error');
  });
  
  // Generate license form
  document.getElementById('generate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('generate-error');
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true);
    
    const formData = {
      kioskName: form.kioskName.value,
      country: form.country.value,
      location: {
        restaurant: form.restaurant.value,
        country: form.country.value,
        region: form.region.value
      },
      validityDays: parseInt(form.validityDays.value)
    };
    
    try {
      await generateLicense(formData);
      closeModal('generate-modal');
    } catch (error) {
      showError('generate-error', error.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
  
  // Search
  document.getElementById('search-licenses').addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    const status = document.getElementById('filter-status').value;
    filterLicenses(searchTerm, status);
  });
  
  // Filter
  document.getElementById('filter-status').addEventListener('change', (e) => {
    const status = e.target.value;
    const searchTerm = document.getElementById('search-licenses').value;
    filterLicenses(searchTerm, status);
  });
  
  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      closeModal(modal.id);
    });
  });
  
  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const modal = overlay.closest('.modal');
        closeModal(modal.id);
      }
    });
  });
  
  // Escape key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) {
        closeModal(activeModal.id);
      }
    }
  });
});

// Make functions globally available for inline onclick handlers
window.viewLicenseDetails = viewLicenseDetails;
window.revokeLicense = revokeLicense;
window.deleteLicense = deleteLicense;
window.generateOfflineFile = generateOfflineFile;
window.closeModal = closeModal;

