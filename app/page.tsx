"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gift, Bot, Zap, Wind, Droplets, 
  X, ScanLine, Loader2, CheckCircle2, 
  ChevronRight, Car, ShoppingBag, MapPin, 
  Trash2, Activity, AlertCircle, Send, Sparkles,
  Camera, Download, LogIn, User
} from 'lucide-react';

// --- Types ---
type TabType = 'dashboard' | 'locations' | 'rewards' | 'ai';
type ScanState = 'idle' | 'camera_active' | 'scanning' | 'identified' | 'success';
type ReceiptType = 'kpay' | 'voucher' | null;

type Transaction = {
  id: string; title: string; type: 'earn' | 'spend'; points: number; co2?: number; date: string;
};
type ChatMessage = { id: string; role: 'user' | 'ai'; text: string; };

const BACKEND_URL = "http://localhost:8000"; 

export default function EcoBinWeb() {
  const [mounted, setMounted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  
  // --- Auth States ---
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // --- Persistent States (Per User) ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // --- UI States ---
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [scanState, setScanState] = useState<ScanState>('idle');
  // ✅ ပြင်ဆင်ချက်: label?: string ကို Type ထဲတွင် သေချာစွာ ထည့်သွင်းပေးထားပါသည်
  const [detectedObject, setDetectedObject] = useState<{ name: string; pts: number; co2: number; label?: string }>({ name: '', pts: 0, co2: 0 });
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [selectedBin, setSelectedBin] = useState<string | null>(null);

  // --- Receipt States ---
  const [receipt, setReceipt] = useState<{ type: ReceiptType, title: string, amount: string, date: string, ref: string }>({ type: null, title: '', amount: '', date: '', ref: '' });

  // Load User Data
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    const savedUsers = JSON.parse(localStorage.getItem('ecoBin_users') || '{}');
    if (savedUsers[username]) {
      setTransactions(savedUsers[username].transactions || []);
      setChatMessages(savedUsers[username].chat || [{ id: 'init', role: 'ai', text: `မင်္ဂလာပါ ${username}။ ပြည်မြို့ သဘာဝပတ်ဝန်းကျင်လေးကို ဆက်လက်ထိန်းသိမ်းပေးပါဦးနော် 🌿` }]);
    } else {
      setTransactions([]);
      setChatMessages([{ id: 'init', role: 'ai', text: `မင်္ဂလာပါ ${username}။ EcoBin Pyay မှ ကြိုဆိုပါတယ်။ အမှိုက်များကို ခွဲခြားပစ်ပြီး ဆုလက်ဆောင်များ ရယူလိုက်ပါ။ 🌸` }]);
    }
    setIsLoggedIn(true);
  };

  // Save User Data
  useEffect(() => {
    if (mounted && isLoggedIn) {
      const savedUsers = JSON.parse(localStorage.getItem('ecoBin_users') || '{}');
      savedUsers[username] = { transactions, chat: chatMessages };
      localStorage.setItem('ecoBin_users', JSON.stringify(savedUsers));
    }
  }, [transactions, chatMessages, mounted, isLoggedIn, username]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, activeTab, isTyping]);

  // ==========================================
  // CALCULATIONS & DYNAMIC MATH FOR UI
  // ==========================================
  const { currentPoints, totalCo2, plasticItems } = useMemo(() => {
    let pts = 0, co2 = 0, plastic = 0; 
    transactions.forEach(tx => {
      if (tx.type === 'earn') {
        pts += tx.points;
        if (tx.co2) co2 += tx.co2;
        if (tx.title.includes('Plastic')) plastic += 1;
      } else {
        pts -= tx.points;
      }
    });
    return { currentPoints: pts, totalCo2: co2.toFixed(2), plasticItems: plastic };
  }, [transactions]);

  const level = Math.floor(currentPoints / 1000) + 1;
  const progress = ((currentPoints % 1000) / 1000) * 100;
  
  // UI Dynamic Logic for Tree and Dolphin
  let treeSrc = '/3-removebg-preview.png'; // Level 1, 2 (Sprout)
  if (level === 3) treeSrc = '/2-removebg-preview.png'; // Level 3 (Medium Smiling Tree)
  if (level >= 4) treeSrc = '/4-removebg-preview.png'; // Level 4+ (Big Tree with squirrels)

  const treeScale = Math.min(1.2, 0.8 + (level * 0.1));
  const isBlooming = level >= 3;
  const isFullBloom = level >= 4;

  const dolphinScale = Math.min(1.2, 0.7 + (level * 0.15));
  const dolphinJump = Math.min(50, 20 + level * 8);
  const dolphinSpeed = Math.max(1.5, 4.0 - level * 0.5);
  const dolphinRotate = Math.min(20, 5 + level * 3);
  const showHearts = level >= 2;

  // Backend Sync
  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    const syncData = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: username, current_points: currentPoints, level: level, total_co2: parseFloat(totalCo2) })
        });
      } catch (err) { }
    };
    syncData();
  }, [currentPoints, level, totalCo2, mounted, isLoggedIn, username]);

  // ==========================================
  // FUNCTIONS
  // ==========================================
  const showToastMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000);
  };

  const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // --- AI Object Scanner Simulation ---
  const startCamera = async () => {
    setScanState('camera_active');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      showToastMsg('ကင်မရာ ဖွင့်၍မရပါ။', 'error');
      setScanState('idle');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setScanState('idle');
  };

  // --- တကယ့် AI ဖြင့် အမှိုက်ကို Scan ဖတ်ခြင်း ---
  const scanWasteWithAI = async () => {
    if (!videoRef.current) return;

    setScanState('scanning');

    // ၁။ ကင်မရာမှ လက်ရှိမြင်ကွင်းကို Canvas ဖြင့် ပုံဖမ်းယူခြင်း
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      showToastMsg("ကင်မရာမှ ပုံရယူ၍မရပါ။", "error");
      setScanState('camera_active');
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // ၂။ ပုံကို ဖိုင် (Blob) အဖြစ်ပြောင်းလဲပြီး Backend သို့ ပို့လွှတ်ခြင်း
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToastMsg("ပုံဖမ်းယူရာတွင် အမှားအယွင်းရှိပါသည်။", "error");
        setScanState('camera_active');
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'scan.jpg');

      try {
        const res = await fetch(`${BACKEND_URL}/api/scan`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          // ✅ ပြင်ဆင်ချက်: Hook Error တက်စေမည့် useState အဟောင်းကို ဖယ်ရှားပြီး 
          // မှန်ကန်သော State Update အဖြစ် ပြောင်းလဲထားပါသည်
          setDetectedObject({
            name: data.name,
            pts: data.pts,
            co2: data.co2,
            label: data.label
          });
          setScanState('identified');
        } else {
          // အမှိုက်ကို သေချာစွာ မဖတ်နိုင်ခဲ့လျှင်
          showToastMsg(data.message || "အမှိုက်ကို သေချာစွာ မဖတ်နိုင်ပါ။", "error");
          setScanState('camera_active');
        }
      } catch (error) {
        showToastMsg("ဆာဗာ (Backend) နှင့် ချိတ်ဆက်၍မရပါ။", "error");
        setScanState('camera_active');
      }
    }, 'image/jpeg', 0.8);
  };
  
  const confirmWasteDrop = () => {
    setScanState('success');
    stopCamera();
    const newTx: Transaction = {
      id: generateId('tx'), title: `Recycled ${detectedObject.name}`, type: 'earn', points: detectedObject.pts, co2: detectedObject.co2,
      date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    setTransactions(prev => [newTx, ...prev]);
    setTimeout(() => setScanState('idle'), 2500);
  };

  // --- Reward Redemption & Receipt Generation ---
  const handleRedeem = (type: ReceiptType, title: string, cost: number, amountLabel: string) => {
    if (currentPoints < cost) return showToastMsg(`Point မလုံလောက်ပါ။ ${cost} pts လိုအပ်ပါတယ်။`, 'error');
    
    const spendTx: Transaction = {
      id: generateId('tx'), title: `Redeemed ${title}`, type: 'spend', points: cost,
      date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    setTransactions(prev => [spendTx, ...prev]);
    
    setReceipt({
      type, title, amount: amountLabel, 
      date: new Date().toLocaleString(), 
      ref: Math.floor(Math.random() * 1000000000).toString()
    });
  };

  const downloadReceipt = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (receipt.type === 'kpay') {
      ctx.fillStyle = '#0055A6'; 
      ctx.fillRect(0, 0, 400, 600);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('KBZPay Transaction', 90, 80);
      ctx.font = 'bold 36px Arial';
      ctx.fillText(receipt.amount, 120, 150);
      ctx.font = '18px Arial';
      ctx.fillText('Status: Success', 140, 200);
      ctx.fillText(`Date: ${receipt.date}`, 40, 300);
      ctx.fillText(`Ref: ${receipt.ref}`, 40, 350);
      ctx.fillText(`Account: ${username}`, 40, 400);
      ctx.fillText('EcoBin Pyay Reward', 120, 550);
    } else {
      ctx.fillStyle = '#FFD700'; 
      ctx.fillRect(0, 0, 400, 600);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 28px Arial';
      ctx.fillText('EcoBin Pyay Voucher', 60, 80);
      ctx.font = 'bold 32px Arial';
      ctx.fillText(receipt.title, 50, 160);
      ctx.font = 'bold 40px Arial';
      ctx.fillText(receipt.amount, 120, 240);
      ctx.font = '18px Arial';
      ctx.fillText(`Date: ${receipt.date}`, 40, 400);
      ctx.fillText(`Voucher Code: ECO-${receipt.ref.substring(0,6)}`, 40, 450);
      ctx.fillText('Thank you for saving the environment!', 40, 550);
    }

    const link = document.createElement('a');
    link.download = `EcoBin_${receipt.type}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToastMsg('ပုံသိမ်းဆည်းမှု အောင်မြင်ပါသည်');
  };

  const handleSendChat = async () => {
    if (!inputText.trim() || isTyping) return;
    const userMsg = inputText.trim();
    setChatMessages(prev => [...prev, { id: generateId('u'), role: 'user', text: userMsg }]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: username, message: userMsg })
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { id: generateId('a'), role: 'ai', text: data.reply }]);
      } else {
        setChatMessages(prev => [...prev, { id: generateId('e'), role: 'ai', text: "ဆာဗာနှင့် ချိတ်ဆက်၍မရပါ။ Backend Run ထားခြင်း ရှိမရှိ စစ်ဆေးပါ။" }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { id: generateId('e'), role: 'ai', text: "အင်တာနက် သို့မဟုတ် ဆာဗာ ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်။" }]);
    } finally { setIsTyping(false); }
  };

  if (!mounted) return null;

  // ==========================================
  // INTRO PAGE
  // ==========================================
  if (showIntro) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#8fd3c8] via-[#a6ded5] to-[#f4e2d3] flex flex-col items-center justify-center font-sans">
        <h1 className="text-5xl md:text-7xl font-black text-teal-900 mb-6 tracking-tight drop-shadow-sm text-center">EcoBin <span className="text-teal-600">Pyay</span></h1>
        <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 3, repeat: Infinity }} className="w-48 h-48 mb-8">
          <img src="/1-removebg-preview.png" alt="Dolphin Intro" className="w-full h-full object-contain mix-blend-multiply drop-shadow-xl" />
        </motion.div>
        <p className="text-xl text-teal-900 font-bold mb-8 text-center max-w-md px-4">သဘာဝကို ကာကွယ်ရင်း ဆုလက်ဆောင်များ ရယူလိုက်ပါ</p>
        <button onClick={() => setShowIntro(false)} className="bg-white text-teal-600 text-2xl font-black px-12 py-5 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
          စတင်မည် <ChevronRight size={28} />
        </button>
      </div>
    );
  }

  // ==========================================
  // LOGIN PAGE
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen w-full bg-[#f4fbf7] flex items-center justify-center p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-teal-100 text-center">
          <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6"><User size={48} className="text-teal-600" /></div>
          <h2 className="text-3xl font-black text-slate-800 mb-2">အကောင့်ဝင်ရန်</h2>
          <p className="text-slate-500 mb-8 font-medium">သင်၏ အမည်ကို ရိုက်ထည့်ပါ</p>
          <form onSubmit={handleLogin} className="space-y-6">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ဥပမာ - Mg Mg" required className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-4 text-xl outline-none focus:border-teal-500 transition-colors text-center font-bold text-slate-700" />
            <button type="submit" className="w-full bg-teal-500 hover:bg-teal-600 text-white text-xl font-black py-4 rounded-2xl shadow-lg shadow-teal-200 transition-all active:scale-95 flex items-center justify-center gap-2">
              ဝင်ရောက်မည် <LogIn size={24} />
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ==========================================
  // MAIN APPLICATION 
  // ==========================================
  return (
    <div className="min-h-screen w-full bg-[#f4fbf7] text-slate-800 font-sans flex flex-col selection:bg-teal-200 relative pb-32">
      
      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] border ${ toast.type === 'error' ? 'bg-white border-rose-200 text-rose-600' : 'bg-white border-teal-200 text-teal-700' }`}>
            {toast.type === 'error' ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
            <span className="font-bold text-base">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- AI Camera Scanner Modal --- */}
      <AnimatePresence>
        {scanState !== 'idle' && scanState !== 'success' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md relative">
              <div className="flex justify-between items-center mb-4 text-white">
                <h3 className="text-xl font-bold flex items-center gap-2"><Camera /> AI အမှိုက်စစ်ဆေးခြင်း</h3>
                <button onClick={stopCamera} className="bg-white/20 p-2 rounded-full"><X /></button>
              </div>
              
              <div className="relative w-full aspect-[3/4] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-700">
                <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                
                {/* Scanner Overlay Animation */}
                {scanState === 'scanning' && (
                  <div className="absolute inset-0 border-[4px] border-teal-400 m-8 rounded-xl relative">
                    <motion.div animate={{ y: [0, 300, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="w-full h-1 bg-teal-400 shadow-[0_0_20px_rgba(20,184,166,1)] absolute top-0" />
                    <div className="absolute bottom-4 left-0 w-full text-center text-teal-400 font-bold bg-black/50 py-1">Analyzing Object...</div>
                  </div>
                )}

                {/* Detection Success Overlay */}
                {scanState === 'identified' && (
                  <div className="absolute inset-0 bg-teal-900/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-[4px] border-teal-400 m-8 rounded-xl">
                    <CheckCircle2 size={64} className="text-white mb-4" />
                    {/* ✅ ပြင်ဆင်ချက်: label မရှိခဲ့ရင် name ကို အစားထိုးပြရန် fallback ထည့်သွင်းထားပါသည် */}
                    <span className="text-white font-black text-2xl text-center mb-2">{detectedObject.label || detectedObject.name}</span>
                    <span className="bg-white text-teal-700 font-bold px-4 py-1 rounded-full mb-8">+{detectedObject.pts} Pts</span>
                    <button onClick={confirmWasteDrop} className="w-full bg-teal-500 text-white font-bold py-4 rounded-xl shadow-lg text-lg">အမှိုက်ပစ်မည်</button>
                  </div>
                )}
              </div>

              {scanState === 'camera_active' && (
                <button onClick={scanWasteWithAI} className="w-full mt-6 bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 rounded-2xl shadow-lg flex justify-center items-center gap-2 text-lg">
                  <ScanLine /> စတင်ဖတ်မည်
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Scan Success */}
        {scanState === 'success' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-teal-900/40 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="bg-white p-12 rounded-[3rem] text-center shadow-2xl max-w-md w-full">
              <CheckCircle2 size={80} className="text-teal-500 mb-6 mx-auto" />
              <h2 className="text-3xl font-black text-teal-900 mb-2">အောင်မြင်ပါသည်!</h2>
              <div className="bg-teal-50 rounded-2xl py-4 px-8 inline-block font-black text-teal-600 text-3xl mt-4">+{detectedObject.pts} PTS</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Receipt Modal --- */}
      <AnimatePresence>
        {receipt.type && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className={`w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative overflow-hidden ${receipt.type === 'kpay' ? 'bg-[#0055A6] text-white' : 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-slate-900'}`}>
              <button onClick={() => setReceipt({ type: null, title: '', amount: '', date: '', ref: '' })} className="absolute top-6 right-6 bg-black/20 p-2 rounded-full hover:bg-black/30"><X size={20}/></button>
              
              <div className="text-center mt-6">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                  <CheckCircle2 size={48} className={receipt.type === 'kpay' ? 'text-white' : 'text-slate-800'} />
                </div>
                <h3 className="text-2xl font-black mb-1">{receipt.type === 'kpay' ? 'KBZPay Success' : 'Reward Voucher'}</h3>
                <p className="opacity-80 text-sm mb-6">{receipt.date}</p>
                
                <div className={`py-6 rounded-2xl mb-6 ${receipt.type === 'kpay' ? 'bg-white/10' : 'bg-white/40'}`}>
                  <p className="text-sm font-bold mb-1">{receipt.title}</p>
                  <p className="text-4xl font-black tracking-tight">{receipt.amount}</p>
                </div>

                <div className="text-left text-sm opacity-90 space-y-2 mb-8 bg-black/10 p-4 rounded-xl">
                  <p className="flex justify-between"><span>Ref:</span> <span className="font-mono">{receipt.ref}</span></p>
                  <p className="flex justify-between"><span>User:</span> <span className="font-bold">{username}</span></p>
                </div>

                <button onClick={downloadReceipt} className={`w-full font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 ${receipt.type === 'kpay' ? 'bg-white text-[#0055A6]' : 'bg-slate-900 text-white'}`}>
                  <Download size={20} /> ဖုန်းထဲသို့ သိမ်းမည်
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-teal-100/50 shadow-sm px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-teal-500 text-white p-2 rounded-xl hidden md:block"><Sparkles size={24}/></div>
            <h1 className="text-xl md:text-2xl font-black text-teal-900">EcoBin <span className="text-teal-500">Pyay</span></h1>
          </div>
          <div className="hidden md:flex gap-4 items-center bg-slate-50 px-6 py-2 rounded-full border border-slate-100">
            {(['dashboard', 'locations', 'rewards', 'ai'] as TabType[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`font-bold capitalize transition-colors ${activeTab === tab ? 'text-teal-600' : 'text-slate-500 hover:text-teal-500'}`}>{tab}</button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-slate-500">{username}</span>
              <div className="flex items-center gap-1"><Zap size={16} className="text-yellow-500" /><span className="font-black text-teal-900">{currentPoints} Pts</span></div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-8">
        <AnimatePresence mode="wait">
          
          {/* ================= DASHBOARD TAB ================= */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard-tab" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
              <div className="md:col-span-8 space-y-6 md:space-y-8">
                
                <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                      <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-1">Ecosystem Restoration</h3>
                      <p className="text-sm font-medium text-slate-500 mb-4">သင်၏ အမှိုက်ခွဲခြားမှုများက ပြည်မြို့၏ ကုန်းနေနှင့် ရေနေသတ္တဝါများ ရှင်သန်မှုကို တိုက်ရိုက်အကျိုးပြုနေပါသည်။</p>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold shadow-sm">Phase {level}</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">{1000 - (currentPoints % 1000)} pts to next phase</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Storyline Split Ecosystem UI */}
                  <div className="relative h-[300px] md:h-[400px] rounded-3xl overflow-hidden flex shadow-inner border border-slate-200">
                    
                    {/* Left Side: Land / Flora Ecosystem */}
                    <div className="w-1/2 relative bg-gradient-to-b from-sky-50 via-sky-100 to-[#dcecc7] flex items-end justify-center border-r-2 border-slate-300">
                      
                      {/* Soil & Earth Layer */}
                      <div className="absolute bottom-0 w-[150%] h-28 bg-gradient-to-t from-[#4E342E] via-[#6D4C41] to-[#8D6E63] rounded-t-[50%] z-10" />
                      <div className="absolute bottom-24 w-[120%] h-6 bg-gradient-to-t from-emerald-600 to-emerald-400 opacity-80 rounded-t-[50%] z-10 blur-[2px]" />
                      
                      <motion.div 
                        key={treeSrc}
                        animate={{ y: [0, -3, 0], scale: treeScale }} 
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute bottom-16 z-20 origin-bottom flex flex-col items-center"
                      >
                        <div className="relative">
                          <div className={`absolute inset-0 ${isFullBloom ? 'bg-green-500' : 'bg-emerald-500'} rounded-full blur-[40px] opacity-20 animate-pulse`} />
                          <img 
                            src={treeSrc} 
                            alt="Land Ecosystem" 
                            /* mix-blend-multiply ကို ဖြုတ်ထားပါသည် (Transparent ပုံများအတွက် ရုပ်ထွက်ပိုကောင်းစေရန်) */
                            className="relative z-10 w-36 md:w-52 object-contain origin-bottom drop-shadow-[0_15px_15px_rgba(0,0,0,0.3)]" 
                          />
                        </div>
                      </motion.div>
                      
                      <div className="absolute top-4 left-4 z-30 bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg font-black text-xs text-emerald-800 shadow-sm border border-emerald-100/50 uppercase tracking-wider">
                        Land Habitat
                      </div>
                    </div>

                    {/* Right Side: Marine / River Ecosystem */}
                    <div className="w-1/2 relative bg-gradient-to-b from-sky-100 via-blue-300 to-blue-700 flex items-end justify-center">
                      
                      {/* Deep Water Layer */}
                      <div className="absolute bottom-0 w-full h-40 bg-gradient-to-t from-[#01579B] via-[#0277BD] to-transparent z-10 opacity-90" />
                      
                      {/* Water Surface Line Animation */}
                      <motion.div 
                        animate={{ x: [-20, 0, -20] }} 
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }} 
                        className="absolute bottom-28 w-[200%] h-1.5 bg-white/30 blur-[1px] z-10" 
                      />

                      <motion.div 
                        animate={{ 
                          y: [-dolphinJump, dolphinJump/3, -dolphinJump], 
                          rotateZ: [-dolphinRotate/2, dolphinRotate/2, -dolphinRotate/2],
                          scale: dolphinScale
                        }} 
                        transition={{ duration: dolphinSpeed, repeat: Infinity, ease: "easeInOut" }} 
                        className="absolute bottom-12 z-20 flex flex-col items-center"
                      >
                        {/* အစ်ကိုပြင်ထားသော Background ဖြတ်ပြီးသား လင်းပိုင်ပုံ */}
                        <img 
                          src="/1-removebg-preview.png" 
                          alt="Marine Ecosystem" 
                          className="relative z-30 w-32 md:w-48 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" 
                        />
                      </motion.div>
                      
                      <div className="absolute top-4 right-4 z-30 bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg font-black text-xs text-blue-800 shadow-sm border border-blue-100/50 uppercase tracking-wider">
                        Marine Habitat
                      </div>
                    </div>
                  </div>
                  
                  {/* Unified Progress Bar connecting Land and Sea */}
                  <div className="mt-6 w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-1000" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Scan Button */}
                <button onClick={startCamera} className="w-full relative overflow-hidden rounded-[2rem] shadow-xl hover:-translate-y-1 group">
                  <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-cyan-500" />
                  <div className="relative px-8 py-8 flex items-center justify-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl group-hover:scale-110 transition-transform"><Camera size={32} className="text-white" /></div>
                    <span className="text-2xl font-black text-white tracking-wide">အမှိုက်များကို AI ဖြင့် စစ်ဆေးမည်</span>
                  </div>
                </button>
              </div>

              <div className="md:col-span-4 space-y-6 md:space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-[1.5rem] p-4 border border-teal-50 shadow-lg text-center">
                    <div className="bg-teal-50 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"><Wind className="text-teal-500" size={24} /></div>
                    <span className="text-2xl font-black text-teal-900">{totalCo2} <span className="text-sm text-slate-500">kg</span></span>
                    <div className="text-[10px] text-teal-600 font-bold uppercase mt-1">CO2 လျှော့ချမှု</div>
                  </div>
                  <div className="bg-white rounded-[1.5rem] p-4 border border-cyan-50 shadow-lg text-center">
                    <div className="bg-cyan-50 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"><Droplets className="text-cyan-500" size={24} /></div>
                    <span className="text-2xl font-black text-cyan-900">{plasticItems} <span className="text-sm text-slate-500">ခု</span></span>
                    <div className="text-[10px] text-cyan-600 font-bold uppercase mt-1">ပလတ်စတစ်</div>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-xl h-[350px] flex flex-col">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Activity size={20} className="text-teal-500"/> မှတ်တမ်း</h3>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-hide">
                    {transactions.length === 0 ? (
                      <p className="text-center text-slate-400 mt-10 font-medium">မှတ်တမ်းမရှိသေးပါ</p>
                    ) : (
                      transactions.slice(0, 10).map((tx) => (
                        <div key={tx.id} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${tx.type === 'earn' ? 'bg-teal-100 text-teal-600' : 'bg-rose-100 text-rose-600'}`}>{tx.type === 'earn' ? <Trash2 size={16} /> : <Gift size={16} />}</div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{tx.title}</p>
                              <p className="text-[10px] text-slate-500">{tx.date}</p>
                            </div>
                          </div>
                          <span className={`font-black text-sm ${tx.type === 'earn' ? 'text-teal-500' : 'text-rose-500'}`}>{tx.type === 'earn' ? '+' : '-'}{tx.points}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        {/* ================= LOCATIONS TAB ================= */}
          {activeTab === 'locations' && (
             <motion.div key="locations-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
               <div className="flex items-center gap-3 mb-6">
                 <MapPin size={32} className="text-teal-600" />
                 <h2 className="text-3xl font-black text-teal-900">SmartBin မြေပုံ (ပြည်မြို့)</h2>
               </div>

               {/* Interactive Kawaii Map Section */}
               <div className="relative w-full h-[350px] md:h-[450px] bg-[#eaf7f4] rounded-[2rem] border-[6px] border-white shadow-xl overflow-hidden mb-8">
                 {/* ဧရာဝတီမြစ် */}
                 <div className="absolute left-[10%] top-0 bottom-0 w-24 md:w-32 bg-blue-200/60 border-x-4 border-blue-300/50 skew-x-[-15deg]" />
                 <div className="absolute left-[5%] top-1/2 -translate-y-1/2 rotate-[-90deg] text-blue-400 font-black text-2xl md:text-4xl tracking-[0.5em] opacity-50 pointer-events-none">
                   ဧရာဝတီမြစ်
                 </div>

                 {/* သဘာဝ ပန်းခြံစိမ်းလန်းမှု */}
                 <div className="absolute right-0 bottom-0 w-64 h-64 bg-green-200/40 rounded-tl-full blur-2xl pointer-events-none" />

                 {/* Map Pins (တည်နေရာများ) */}
                 {[
                   { id: 'BIN-01', name: 'ကမ်းနားလမ်း', top: '30%', left: '25%', color: 'text-rose-500', fill: 'fill-rose-500' },
                   { id: 'BIN-02', name: 'ရွှေဆံတော်ဘုရား', top: '45%', left: '55%', color: 'text-yellow-500', fill: 'fill-yellow-500' },
                   { id: 'BIN-03', name: 'ပြည်တက္ကသိုလ်', top: '75%', left: '75%', color: 'text-purple-500', fill: 'fill-purple-500' },
                   { id: 'BIN-04', name: 'နဝဒေးတံတား', top: '65%', left: '15%', color: 'text-teal-600', fill: 'fill-teal-600' }
                 ].map((pin) => (
                   <motion.button
                     key={pin.id}
                     whileHover={{ scale: 1.1 }}
                     onClick={() => setSelectedBin(pin.id === selectedBin ? null : pin.id)}
                     className={`absolute flex flex-col items-center -translate-x-1/2 -translate-y-full cursor-pointer z-10 transition-all ${selectedBin === pin.id ? 'z-20 scale-125' : 'opacity-80 hover:opacity-100'}`}
                     style={{ top: pin.top, left: pin.left }}
                   >
                     {selectedBin === pin.id && (
                       <span className="absolute -top-2 w-4 h-4 bg-white rounded-full animate-ping opacity-60" />
                     )}
                     <MapPin size={selectedBin === pin.id ? 48 : 36} className={`${pin.color} ${pin.fill} drop-shadow-md transition-all`} />
                     <span className={`mt-1 px-3 py-1 rounded-xl text-xs font-black shadow-md transition-colors ${selectedBin === pin.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>
                       {pin.name}
                     </span>
                   </motion.button>
                 ))}
               </div>

               {/* SmartBin List Cards */}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                   { name: 'ကမ်းနားလမ်း (Strand Road)', id: 'BIN-01', dist: '1.2 km', desc: 'ညဈေးတန်းအနီး' },
                   { name: 'ရွှေဆံတော်ဘုရား (Shwesandaw)', id: 'BIN-02', dist: '2.5 km', desc: 'တောင်ဘက်မုဒ်' },
                   { name: 'ပြည်တက္ကသိုလ် (Pyay Uni)', id: 'BIN-03', dist: '4.0 km', desc: 'ကျောင်းသားရေးရာအရှေ့' },
                   { name: 'နဝဒေးတံတား (Nawaday Bridge)', id: 'BIN-04', dist: '5.1 km', desc: 'တံတားထိပ် ပန်းခြံအနီး' }
                 ].map((bin) => (
                   <div 
                     key={bin.id} 
                     onClick={() => setSelectedBin(bin.id)}
                     className={`rounded-[2rem] p-6 border-2 transition-all cursor-pointer relative overflow-hidden group ${selectedBin === bin.id ? 'bg-teal-50 border-teal-500 shadow-xl scale-105' : 'bg-white border-teal-100 shadow-sm hover:shadow-md'}`}
                   >
                     <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full transition-transform -z-10 ${selectedBin === bin.id ? 'bg-teal-200 scale-150' : 'bg-slate-50 group-hover:bg-teal-50'}`}/>
                     <div>
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors ${selectedBin === bin.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-teal-600'}`}>
                         <MapPin size={24}/>
                       </div>
                       <h3 className="text-lg font-black text-slate-800 leading-tight mb-1">{bin.name}</h3>
                       <p className="text-sm text-slate-500 font-medium mb-2">{bin.desc}</p>
                     </div>
                     <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-100">
                       <span className="bg-white/50 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold font-mono">{bin.id}</span>
                       <span className="text-teal-600 font-black text-sm">{bin.dist}</span>
                     </div>
                   </div>
                 ))}
               </div>
             </motion.div>
          )}

          {/* ================= REWARDS TAB ================= */}
          {activeTab === 'rewards' && (
             <motion.div key="rewards-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
               <h2 className="text-3xl font-black text-teal-900 mb-2">ဆုလက်ဆောင်များ</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 
                 {/* KBZ Pay */}
                 <div className="bg-white rounded-[2rem] p-8 border border-blue-100 shadow-xl flex flex-col justify-between hover:shadow-2xl transition-shadow overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px] -z-10" />
                   <div>
                     <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-6"><span className="font-black text-white text-3xl">K</span></div>
                     <h3 className="text-2xl font-black text-slate-800">KBZPay ငွေသား</h3>
                     <p className="text-slate-500 mt-2 font-medium">1000 Pts = 1,000 MMK</p>
                   </div>
                   <button onClick={() => handleRedeem('kpay', 'KBZPay Cash', 1000, '1,000 Ks')} className="mt-8 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold py-4 rounded-2xl w-full shadow-lg">ငွေထုတ်မည်</button>
                 </div>

                 {/* Mate Swe Oway */}
                 <div className="bg-white rounded-[2rem] p-8 border border-yellow-100 shadow-xl flex flex-col justify-between hover:shadow-2xl transition-shadow overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-50 rounded-bl-[100px] -z-10" />
                   <div>
                     <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-2xl flex items-center justify-center shadow-lg mb-6"><Car size={32} /></div>
                     <h3 className="text-2xl font-black text-slate-800">မိတ်ဆွေအိုးဝေ (Pyay)</h3>
                     <p className="text-slate-500 mt-2 font-medium">၅၀၀ ကျပ် ယာဉ်စီးခ Discount</p>
                     <span className="inline-block mt-3 bg-yellow-100 text-yellow-700 font-black px-4 py-1 rounded-full text-sm">500 PTS</span>
                   </div>
                   <button onClick={() => handleRedeem('voucher', 'မိတ်ဆွေအိုးဝေ Discount', 500, '500 Ks Off')} className="mt-8 bg-slate-800 hover:bg-slate-900 text-white text-lg font-bold py-4 rounded-2xl w-full shadow-lg">ကူပွန်ရယူမည်</button>
                 </div>

                 {/* Shwe Min Tha Mee */}
                 <div className="bg-white rounded-[2rem] p-8 border border-purple-100 shadow-xl flex flex-col justify-between hover:shadow-2xl transition-shadow overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-[100px] -z-10" />
                   <div>
                     <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-6"><ShoppingBag size={32} /></div>
                     <h3 className="text-2xl font-black text-slate-800">ရွှေမင်းသမီးစင်တာ</h3>
                     <p className="text-slate-500 mt-2 font-medium">၂၀၀၀ ကျပ် Shopping Voucher</p>
                     <span className="inline-block mt-3 bg-purple-100 text-purple-700 font-black px-4 py-1 rounded-full text-sm">2000 PTS</span>
                   </div>
                   <button onClick={() => handleRedeem('voucher', 'ရွှေမင်းသမီးစင်တာ Voucher', 2000, '2,000 Ks')} className="mt-8 bg-slate-800 hover:bg-slate-900 text-white text-lg font-bold py-4 rounded-2xl w-full shadow-lg">ကူပွန်ရယူမည်</button>
                 </div>

               </div>
             </motion.div>
          )}

          {/* ================= AI TAB ================= */}
          {activeTab === 'ai' && (
             <motion.div key="ai-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto bg-white rounded-[2rem] shadow-2xl border border-teal-100 h-[70vh] flex flex-col">
               <div className="bg-teal-50 border-b border-teal-100 p-4 md:p-6 flex gap-4 items-center rounded-t-[2rem]">
                 <div className="bg-teal-500 p-3 md:p-4 rounded-2xl text-white"><Bot size={28} /></div>
                 <div>
                   <h3 className="text-xl md:text-2xl font-black text-teal-900">Eco-Coach AI</h3>
                   <p className="text-xs md:text-sm font-semibold text-teal-600 mt-1">အမှိုက်ခွဲခြားနည်းများ မေးမြန်းနိုင်ပါတယ်</p>
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-[#f8fdfa]">
                 {chatMessages.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`px-4 py-3 md:px-6 md:py-4 rounded-3xl text-base md:text-lg max-w-[85%] shadow-sm ${msg.role === 'user' ? 'bg-teal-600 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-teal-100 rounded-bl-sm whitespace-pre-line'}`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
                 {isTyping && (
                   <div className="flex justify-start">
                     <div className="px-6 py-4 rounded-3xl bg-white border border-teal-100 shadow-sm flex gap-2 items-center">
                       <span className="w-2 h-2 bg-teal-300 rounded-full animate-bounce" />
                       <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce delay-100" />
                       <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce delay-200" />
                     </div>
                   </div>
                 )}
                 <div ref={chatEndRef} />
               </div>
               <div className="p-4 md:p-6 bg-white flex gap-2 md:gap-4 rounded-b-[2rem]">
                 <input 
                   type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendChat()} 
                   placeholder="မေးခွန်းရိုက်ထည့်ပါ..." disabled={isTyping}
                   className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 md:px-6 md:py-4 text-base md:text-lg outline-none focus:border-teal-500" 
                 />
                 <button onClick={handleSendChat} disabled={isTyping} className="bg-teal-500 text-white px-6 md:px-8 rounded-2xl disabled:opacity-50"><Send size={24} /></button>
               </div>
             </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* MOBILE NAV */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white/90 backdrop-blur-xl border-t border-teal-100 flex justify-around py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
        {(['dashboard', 'locations', 'rewards', 'ai'] as TabType[]).map((tab) => {
          const Icon = tab === 'dashboard' ? Activity : tab === 'locations' ? MapPin : tab === 'rewards' ? Gift : Bot;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex flex-col items-center gap-1 w-1/4 transition-colors ${activeTab === tab ? 'text-teal-600' : 'text-slate-400'}`}>
              <Icon size={24} /><span className="text-[10px] font-bold capitalize">{tab}</span>
            </button>
          )
        })}
      </nav>
    </div>
  );
}
