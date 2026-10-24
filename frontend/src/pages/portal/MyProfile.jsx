import { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../api/client.js';
import { Card, PageHeader } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

function fullName(e) {
  return e ? [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ') : '';
}

function initials(e) {
  const f = (e?.first_name || '').trim();
  const l = (e?.last_name || '').trim();
  return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
}

async function resizeToJpeg(file, maxSide = 512) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('That file is not a valid image.'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.88);
  return out.split(',')[1];
}

export default function MyProfile() {
  const { user } = useAuth();
  const { data: me, loading, error, setData } = useResource('/api/me/profile');
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [bust, setBust] = useState('');

  async function pickPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !me) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setUploadError('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const base64 = await resizeToJpeg(file);
      const res = await api.post('/api/me/photo', { photo_base64: base64, photo_mime: 'image/jpeg' });
      setData({ ...me, photo_url: res.photo_url });
      setBust(String(Date.now()));
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const photoSrc = me?.photo_url ? `${me.photo_url}?v=${encodeURIComponent(bust || (me.updated_at || '').slice(0, 19))}` : null;

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your records are maintained by HR — request changes from your HR Admin." />
      {loading && <p>Loading…</p>}
      {!loading && error && <p className="alert error">{error}</p>}
      {me && (
        <>
          <div className="profile-hero">
            <div className="profile-photo-wrap">
              {photoSrc ? (
                <img className="profile-photo" src={photoSrc} alt="Profile" />
              ) : (
                <div className="profile-photo profile-photo-initials" aria-hidden="true">{initials(me)}</div>
              )}
              <button
                type="button"
                className="profile-photo-btn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title={photoSrc ? 'Change photo' : 'Add photo'}
              >
                {uploading ? '…' : '📷'}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickPhoto} />
            </div>
            <div className="profile-hero-info">
              <h1 className="profile-hero-name">{fullName(me)}</h1>
              <div className="profile-hero-role">{me.position} · {me.department}</div>
              <div className="profile-hero-badges">
                <span className={`dash-badge ${me.status === 'Active' ? 'positive' : 'neutral'}`}>{me.status}</span>
                <span className="dash-badge neutral">{me.employment_type}</span>
                <span className="dash-badge info">{me.code}</span>
              </div>
              {uploadError && <div className="alert error" style={{ marginTop: 10 }}>{uploadError}</div>}
            </div>
          </div>

          <div className="grid-2">
            <Card title="Employment" body>
              <div className="profile-rows">
                <div className="profile-row"><span>Employee code</span><strong>{me.code}</strong></div>
                <div className="profile-row"><span>Position</span><strong>{me.position}</strong></div>
                <div className="profile-row"><span>Department</span><strong>{me.department}</strong></div>
                <div className="profile-row"><span>Employment type</span><strong>{me.employment_type}</strong></div>
                <div className="profile-row"><span>Hire date</span><strong>{me.hire_date}</strong></div>
              </div>
            </Card>
            <Card title="Contact" body>
              <div className="profile-rows">
                <div className="profile-row"><span>Work email</span><strong>{me.email || '—'}</strong></div>
                <div className="profile-row"><span>Mobile</span><strong>{me.mobile || '—'}</strong></div>
              </div>
              <p className="settings-note">Ask your HR Admin to update contact details.</p>
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Pay &amp; account" body>
              <div className="profile-rows">
                <div className="profile-row"><span>Monthly basic salary</span><strong>{money(me.basic_salary)}</strong></div>
                <div className="profile-row"><span>Login account</span><strong>{user?.email} · Employee portal</strong></div>
                <div className="profile-row"><span>Password</span><strong>Reset by your HR Admin (self-service reset is disabled)</strong></div>
              </div>
            </Card>
            <Card title="Photo guidelines" body>
              <p style={{ marginTop: 0 }} className="settings-note">
                Use a clear front-facing photo (JPEG, PNG or WebP). It is resized to 512 px automatically
                and shown to HR on your employee record.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
