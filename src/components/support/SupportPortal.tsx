import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  LifeBuoy,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Shield,
  Search,
  Headphones
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { authService } from '../../services/authService';
import type { SupportTicket, SupportMessage } from '../../types';

export const SupportPortal: React.FC = () => {
  const { currentUser } = useTrading();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');

  // New Ticket Form State
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('Deposit/Withdrawal');
  const [newInitialMsg, setNewInitialMsg] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      const res = await authService.getSupportTickets();
      setTickets(res.tickets);
      if (res.tickets.length > 0 && !activeTicket) {
        setActiveTicket(res.tickets[0]);
      }
    } catch (err: any) {
      console.error('Failed to load tickets', err);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    try {
      const res = await authService.getSupportMessages(ticketId);
      setMessages(res.messages);
    } catch (err: any) {
      console.error('Failed to load ticket messages', err);
    }
  };

  useEffect(() => {
    void fetchTickets();
  }, []);

  useEffect(() => {
    if (activeTicket) {
      void fetchMessages(activeTicket.id);
    }
  }, [activeTicket?.id]);

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newInitialMsg.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await authService.createSupportTicket({
        subject: newSubject,
        category: newCategory,
        message: newInitialMsg,
      });
      setTickets(prev => [res.ticket, ...prev]);
      setActiveTicket(res.ticket);
      setIsCreatingTicket(false);
      setNewSubject('');
      setNewInitialMsg('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit support ticket.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !newMessageText.trim()) return;

    const textToSend = newMessageText.trim();
    setNewMessageText('');
    try {
      const res = await authService.sendSupportMessage(activeTicket.id, textToSend);
      setMessages(prev => [...prev, res.message]);
    } catch (err: any) {
      console.error('Failed to send message', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Support Header */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0d1428] via-[#090e1e] to-[#121936] p-6 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
              <Headphones className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-mono text-xl font-bold text-white">Nexify Customer Care & Support</h1>
              <p className="text-xs text-slate-400 font-mono">Dedicated 24/7 client resolution center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 font-mono text-xs text-slate-300">
              Client Reference ID: <strong className="text-purple-300">{currentUser?.clientId || 'CL-000000'}</strong>
            </div>
            <button
              onClick={() => setIsCreatingTicket(true)}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 font-mono text-xs font-bold text-white hover:bg-purple-500 transition-all shadow-lg"
            >
              <PlusCircle className="h-4 w-4" />
              New Inquiry
            </button>
          </div>
        </div>
      </div>

      {/* Main Support Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Tickets List */}
        <div className="rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="font-mono text-sm font-bold text-white">My Support Tickets</h2>
            <span className="rounded-full bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 font-mono text-[10px] text-purple-300 font-bold">
              {tickets.length} Total
            </span>
          </div>

          {tickets.length === 0 ? (
            <div className="py-12 text-center">
              <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="font-mono text-xs text-slate-400">No support inquiries opened yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {tickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => { setActiveTicket(ticket); setIsCreatingTicket(false); }}
                  className={`w-full text-left rounded-xl border p-3.5 transition-all font-mono ${
                    activeTicket?.id === ticket.id
                      ? 'border-purple-500/80 bg-purple-950/30 text-white shadow-md'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400">{ticket.category}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      ticket.status === 'open' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                      ticket.status === 'in_progress' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800/40' :
                      'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold truncate text-white">{ticket.subject}</h3>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Ticket #{ticket.id.slice(-6).toUpperCase()}</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Active Conversation Chat Desk or New Ticket Form */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#090e1e]/90 p-5 shadow-xl flex flex-col min-h-[500px]">
          {isCreatingTicket ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="font-mono text-sm font-bold text-white">Create New Support Inquiry</h2>
                <button onClick={() => setIsCreatingTicket(false)} className="font-mono text-xs text-slate-400 hover:text-white">
                  Cancel
                </button>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 font-mono">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleCreateTicketSubmit} className="space-y-4 font-mono">
                <div>
                  <label className="mb-1.5 block text-xs uppercase text-slate-300">Category</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none focus:border-purple-500/60"
                  >
                    <option value="Deposit/Withdrawal">Deposit & Withdrawal</option>
                    <option value="Trading Engine">Trading & Futures Engine</option>
                    <option value="Account & Profile">Account & Security</option>
                    <option value="Mining Pool">Mining & Staking Pool</option>
                    <option value="General">General Inquiry</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase text-slate-300">Subject</label>
                  <input
                    type="text"
                    required
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="Brief description of your issue"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none focus:border-purple-500/60"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase text-slate-300">Message Body</label>
                  <textarea
                    required
                    rows={5}
                    value={newInitialMsg}
                    onChange={e => setNewInitialMsg(e.target.value)}
                    placeholder="Describe your inquiry in detail..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-white outline-none focus:border-purple-500/60 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl bg-purple-600 py-3 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50 transition-all shadow-lg"
                >
                  {isLoading ? 'Submitting Inquiry...' : 'Submit Support Inquiry'}
                </button>
              </form>
            </div>
          ) : activeTicket ? (
            <div className="flex flex-col h-full flex-1">
              {/* Active Ticket Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 font-mono">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">{activeTicket.subject}</h2>
                    <span className="text-[10px] text-purple-400 font-bold uppercase">[{activeTicket.category}]</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Account Ref: {activeTicket.userClientId}</span>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  activeTicket.status === 'open' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                  activeTicket.status === 'in_progress' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800/40' :
                  'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                }`}>
                  {activeTicket.status.replace('_', ' ')}
                </span>
              </div>

              {/* Messages History */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[380px] pr-2 mb-4 font-mono">
                {messages.map(msg => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                        {isAdmin ? <Shield className="h-3 w-3 text-purple-400" /> : <User className="h-3 w-3 text-slate-400" />}
                        <span className="font-bold text-slate-300">{msg.senderName}</span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
                        isAdmin
                          ? 'border border-purple-500/30 bg-purple-950/40 text-purple-100 rounded-tl-none'
                          : 'border border-slate-700 bg-slate-800 text-slate-100 rounded-tr-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 border-t border-slate-800">
                <input
                  type="text"
                  value={newMessageText}
                  onChange={e => setNewMessageText(e.target.value)}
                  placeholder="Type a response to support..."
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 font-mono text-xs text-white outline-none focus:border-purple-500/60"
                />
                <button
                  type="submit"
                  disabled={!newMessageText.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 font-mono text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50 transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </form>
            </div>
          ) : (
            <div className="py-20 text-center font-mono">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">Select a support ticket to view conversation or submit a new inquiry.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
