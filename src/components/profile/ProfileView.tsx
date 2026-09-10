import React, { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Shield,
  Key,
  Copy,
  Check,
  CheckCircle,
  AlertTriangle,
  QrCode,
  Bell,
  Lock,
  Camera,
  RefreshCw
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { authService } from '../../services/authService';

export const ProfileView: React.FC = () => {
  const { currentUser, wallet } = useTrading();

  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || 'avatar-1');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(currentUser?.twoFactorEnabled));

  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const avatars = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-admin'];

  const handleCopy = (text: string, type: 'client' | 'referral') => {
    navigator.clipboard.writeText(text);
    if (type === 'client') {
      setCopiedClientId(true);
      setTimeout(() => setCopiedClientId(false), 2000);
    } else {
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setIsUpdatingProfile(true);

    try {
      await authService.updateProfile({ name, phone, avatar });
      setProfileMsg({ type: 'success', text: 'Profile information updated successfully.' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const registrationDateStr = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Recently';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0d1428] via-[#090e1e] to-[#121936] p-6 shadow-xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 font-mono text-2xl font-bold text-white shadow-lg">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-purple-300">
                <Camera className="h-3 w-3" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-xl font-bold text-white">{currentUser?.name || 'Client Profile'}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                  currentUser?.role === 'admin' ? 'bg-purple-950/80 text-purple-300 border border-purple-600/40' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/40'
                }`}>
                  {currentUser?.role || 'Trader'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 font-mono">{currentUser?.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                <span>Client ID: <strong className="text-purple-300">{currentUser?.clientId || 'CL-000000'}</strong></span>
                <span>•</span>
                <span>Member since {registrationDateStr}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-right">
              <span className="block font-mono text-[10px] uppercase text-slate-400">USDT Balance</span>
              <span className="font-mono text-base font-bold text-emerald-400">${wallet.usdtBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-right">
              <span className="block font-mono text-[10px] uppercase text-slate-400">Account Status</span>
              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Personal Information & Referral */}
        <div className="space-y-6 lg:col-span-2">
          {/* Profile Edit Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-purple-400" />
                <h2 className="font-mono text-base font-bold text-white">Personal Information</h2>
              </div>
              <span className="font-mono text-xs text-slate-400">Update account details</span>
            </div>

            {profileMsg && (
              <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-mono ${
                profileMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-rose-500/30 bg-rose-950/30 text-rose-300'
              }`}>
                {profileMsg.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase text-slate-300">Full Name</label>
                  <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 focus-within:border-purple-500/60">
                    <User className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      className="w-full bg-transparent font-mono text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase text-slate-300">Phone Number</label>
                  <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 focus-within:border-purple-500/60">
                    <Phone className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-transparent font-mono text-xs text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-mono text-xs uppercase text-slate-300">Email Address (Primary)</label>
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 opacity-80 cursor-not-allowed">
                  <Mail className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    className="w-full bg-transparent font-mono text-xs text-slate-400 outline-none cursor-not-allowed"
                  />
                  <span className="ml-2 font-mono text-[10px] uppercase text-emerald-400">Verified</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block font-mono text-xs uppercase text-slate-300">Avatar Selection</label>
                <div className="flex items-center gap-3">
                  {avatars.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-xs font-bold transition-all ${
                        avatar === av ? 'border-purple-500 bg-purple-600 text-white shadow-lg scale-105' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {av.replace('avatar-', 'A')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="rounded-xl bg-purple-600 px-5 py-2.5 font-mono text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50 transition-all shadow-lg"
                >
                  {isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Referral & Invitation Code Section */}
          <div className="rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-indigo-400" />
                <h2 className="font-mono text-base font-bold text-white">Referral & Partner Code</h2>
              </div>
              <span className="font-mono text-xs text-emerald-400 font-bold">Earn Commission Rewards</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <span className="block font-mono text-xs uppercase text-slate-400">My Referral Code</span>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-950/30 px-3 py-2">
                  <span className="font-mono text-sm font-bold text-purple-300">{currentUser?.myReferralCode || 'REF-NEXIFY'}</span>
                  <button
                    onClick={() => handleCopy(currentUser?.myReferralCode || 'REF-NEXIFY', 'referral')}
                    className="text-purple-400 hover:text-purple-200"
                  >
                    {copiedReferral ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <span className="block font-mono text-xs uppercase text-slate-400">My Client ID</span>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                  <span className="font-mono text-sm font-bold text-slate-200">{currentUser?.clientId || 'CL-000000'}</span>
                  <button
                    onClick={() => handleCopy(currentUser?.clientId || 'CL-000000', 'client')}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    {copiedClientId ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Security & KYC Settings */}
        <div className="space-y-6">
          {/* Security & Password Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-400" />
                <h2 className="font-mono text-base font-bold text-white">Security Settings</h2>
              </div>
            </div>

            {passwordMsg && (
              <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-mono ${
                passwordMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-rose-500/30 bg-rose-950/30 text-rose-300'
              }`}>
                {passwordMsg.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-xs uppercase text-slate-300">Current Password</label>
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 focus-within:border-purple-500/60">
                  <Lock className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full bg-transparent font-mono text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-xs uppercase text-slate-300">New Password</label>
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 focus-within:border-purple-500/60">
                  <Key className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                    className="w-full bg-transparent font-mono text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-xs uppercase text-slate-300">Confirm New Password</label>
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 focus-within:border-purple-500/60">
                  <Key className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full bg-transparent font-mono text-xs text-white outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPassword}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 font-mono text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition-all"
              >
                {isChangingPassword ? 'Updating Password...' : 'Change Password'}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block font-mono text-xs font-bold text-white">Two-Factor Authentication (2FA)</span>
                  <span className="block font-mono text-[11px] text-slate-400">Require 2FA code at login</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${twoFactorEnabled ? 'bg-purple-600' : 'bg-slate-800'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* KYC Status Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <h2 className="font-mono text-base font-bold text-white">Verification Status</h2>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-300">Identity Tier:</span>
                <span className="font-mono text-xs font-bold text-purple-300">Tier 1 (Basic)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-300">Verification Status:</span>
                <span className="font-mono text-xs font-bold text-emerald-400 uppercase">Verified</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-300">Daily Withdrawal Limit:</span>
                <span className="font-mono text-xs font-bold text-white">$100,000 USDT</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
