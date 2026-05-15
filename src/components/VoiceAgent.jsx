"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, X, Check, Loader2, ChevronRight, AlertCircle } from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "walk-in",  label: "Walk-In",  color: "#3b82f6" },
  { value: "call",     label: "Call",     color: "#10b981" },
  { value: "text",     label: "Text",     color: "#8b5cf6" },
  { value: "email",    label: "Email",    color: "#f59e0b" },
  { value: "update",   label: "Update",  color: "#64748b" },
  { value: "bdr-note", label: "BDR Note", color: "#ec4899" },
];

// Fuzzy account matcher — returns best match from savedAccounts for a given name string
function fuzzyMatch(query, accounts) {
  if (!query || !accounts?.length) return null;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const q = normalize(query);
  const qTokens = q.split(/\s+/);

  let best = null;
  let bestScore = 0;

  for (const acc of accounts) {
    const n = normalize(acc.name || "");
    const nTokens = n.split(/\s+/);

    // Exact match
    if (n === q) return acc;

    let score = 0;
    // Substring containment
    if (n.includes(q) || q.includes(n)) score += 60;
    // Token overlap
    const overlap = qTokens.filter(t => t.length > 1 && nTokens.includes(t)).length;
    score += overlap * 20;
    // Starts with
    if (n.startsWith(q) || q.startsWith(n)) score += 20;

    if (score > bestScore) { bestScore = score; best = acc; }
  }

  return bestScore >= 20 ? best : null;
}

// Convert a Blob to a base64 string (data portion only)
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceAgent({ savedAccounts, refreshSavedAccounts, inline = false }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);   // recording in progress
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [matchedAccount, setMatchedAccount] = useState(null);
  const [overrideAccount, setOverrideAccount] = useState(null);
  const [logging, setLogging] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMsg, setResultMsg] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [micError, setMicError] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const inputRef = useRef(null);

  useEffect(() => {
    setVoiceSupported(!!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInputText("");
    setParsed(null);
    setMatchedAccount(null);
    setOverrideAccount(null);
    setResult(null);
    setResultMsg("");
    setProcessing(false);
    setLogging(false);
    setMicError("");
    setTranscribing(false);
  }, []);

  const handleOpen = () => { reset(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); };
  const handleClose = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setListening(false);
    setOpen(false);
    reset();
  };

  const toggleListening = async () => {
    // Stop recording
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }

    setMicError("");
    setTranscript("");
    setInputText("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick the best supported mime type
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";

      chunksRef.current = [];
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);

        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        if (blob.size < 500) {
          setMicError("Recording was too short. Tap the mic, speak your command, then tap again.");
          return;
        }

        setTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const baseMime = rec.mimeType.split(";")[0] || "audio/webm";
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64, mimeType: baseMime }),
            credentials: "include",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed");
          if (!data.transcript) throw new Error("No speech detected — try speaking louder or closer to the mic.");
          setTranscript(data.transcript);
          setInputText(data.transcript);
        } catch (err) {
          setMicError(err.message || "Could not transcribe audio. Please type your command instead.");
        } finally {
          setTranscribing(false);
        }
      };

      rec.onerror = () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);
        setMicError("Recording failed. Please try again.");
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access was denied. Please allow mic access in your browser/device settings, then try again.");
      } else if (err.name === "NotFoundError") {
        setMicError("No microphone found. Check that your device has a mic available.");
      } else {
        setMicError("Could not start recording: " + (err.message || err.name));
      }
    }
  };

  const handleParse = async (text) => {
    const command = (text || inputText).trim();
    if (!command) return;
    setProcessing(true);
    setParsed(null);
    setMatchedAccount(null);
    setOverrideAccount(null);
    setResult(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");

      setParsed(data);
      const match = fuzzyMatch(data.accountName, savedAccounts);
      setMatchedAccount(match || null);
    } catch (err) {
      setResult("error");
      setResultMsg(err.message || "Could not parse command");
    } finally {
      setProcessing(false);
    }
  };

  const handleLog = async () => {
    const account = overrideAccount || matchedAccount;
    if (!account || !parsed?.noteText) return;

    setLogging(true);
    setResult(null);
    try {
      const payload = {
        accountId: account.id,
        text: parsed.noteText,
        activity_type: parsed.activityType || "walk-in",
        entry_type: "activity",
      };
      if (parsed.followUpDate) payload.follow_up_at = parsed.followUpDate;

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Log failed");

      await refreshSavedAccounts?.();
      setResult("success");
      setResultMsg(`Logged for ${account.name}`);
      // In inline mode reset the form after a moment; in modal mode close the sheet
      setTimeout(() => { if (inline) { reset(); } else { handleClose(); } }, 1800);
    } catch (err) {
      setResult("error");
      setResultMsg(err.message || "Could not log activity");
    } finally {
      setLogging(false);
    }
  };

  const effectiveAccount = overrideAccount || matchedAccount;

  // ── Shared inner content (used in both inline page and modal) ───────────
  const innerContent = (
    <div className="space-y-3">
      {/* Input row — only shown before parsing */}
      {!parsed && !processing && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleParse()}
            placeholder={`"Log a walk-in for Joe's Pizza…"`}
            className="flex-1 bg-slate-800/70 border border-slate-600/60 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {voiceSupported && (
            <button
              onClick={toggleListening}
              disabled={transcribing}
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                transcribing
                  ? "bg-slate-800 border border-slate-600/60 text-slate-600 cursor-not-allowed"
                  : listening
                  ? "bg-rose-500/20 border border-rose-500/40 text-rose-400 animate-pulse"
                  : "bg-slate-800 border border-slate-600/60 text-slate-400 hover:text-white hover:border-indigo-500/60"
              }`}
            >
              {transcribing ? <Loader2 size={16} className="animate-spin" /> : listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <button
            onClick={() => handleParse()}
            disabled={!inputText.trim()}
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition-all"
          >
            <ChevronRight size={16} className="text-white" />
          </button>
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-medium">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{micError}</span>
        </div>
      )}

      {/* Recording indicator */}
      {listening && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div className="w-2 h-2 rounded-full bg-rose-400 animate-ping flex-shrink-0" />
          <span className="text-rose-300 text-[11px] font-bold">Recording… tap mic to stop</span>
        </div>
      )}

      {/* Transcribing indicator */}
      {transcribing && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <Loader2 size={13} className="text-indigo-400 animate-spin flex-shrink-0" />
          <span className="text-indigo-300 text-[11px] font-bold">Transcribing…</span>
        </div>
      )}

      {/* Processing */}
      {processing && (
        <div className="flex items-center gap-3 py-6 justify-center">
          <Loader2 size={20} className="text-indigo-400 animate-spin" />
          <span className="text-slate-400 text-[12px] font-bold">Parsing your command…</span>
        </div>
      )}

      {/* Parsed result / confirmation */}
      {parsed && !processing && (
        <div className="space-y-3">
          {/* What we heard */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Command</div>
            <div className="text-slate-300 text-[12px]">{inputText}</div>
          </div>

          {/* Activity type */}
          <div className="flex items-center gap-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-20 flex-shrink-0">Type</div>
            <div className="flex gap-1.5 flex-wrap">
              {ACTIVITY_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setParsed(p => ({ ...p, activityType: t.value }))}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border transition-all ${
                    parsed.activityType === t.value ? "border-white/30 text-white" : "border-slate-700/50 text-slate-500 hover:text-slate-300"
                  }`}
                  style={parsed.activityType === t.value ? { backgroundColor: t.color + "33", borderColor: t.color + "66", color: t.color } : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account */}
          <div className="flex items-start gap-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-20 flex-shrink-0 mt-1">Account</div>
            <div className="flex-1">
              {effectiveAccount ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-1.5">
                    <div className="text-emerald-300 text-[12px] font-bold">{effectiveAccount.name}</div>
                    {effectiveAccount.address && <div className="text-slate-500 text-[10px] truncate">{effectiveAccount.address}</div>}
                  </div>
                  <button onClick={() => setOverrideAccount(null)} className="text-slate-600 hover:text-slate-400 transition-colors" title="Change account">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 text-[11px]">
                    <AlertCircle size={12} />
                    <span>"{parsed.accountName}" not found in saved accounts</span>
                  </div>
                  <AccountSearchPicker accounts={savedAccounts} onSelect={a => setOverrideAccount(a)} />
                </div>
              )}
            </div>
          </div>

          {/* Note text */}
          <div className="flex items-start gap-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-20 flex-shrink-0 mt-1">Note</div>
            <textarea
              value={parsed.noteText || ""}
              onChange={e => setParsed(p => ({ ...p, noteText: e.target.value }))}
              className="flex-1 bg-slate-800/70 border border-slate-600/60 rounded-xl px-3 py-2 text-[12px] text-white resize-none focus:outline-none focus:border-indigo-500 transition-colors"
              rows={3}
            />
          </div>

          {/* Follow-up */}
          {parsed.followUpDate && (
            <div className="flex items-center gap-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-20 flex-shrink-0">Follow-up</div>
              <input
                type="date"
                value={parsed.followUpDate}
                onChange={e => setParsed(p => ({ ...p, followUpDate: e.target.value }))}
                className="bg-slate-800/70 border border-slate-600/60 rounded-xl px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}

          {/* Result message */}
          {result && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold ${
              result === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
            }`}>
              {result === "success" ? <Check size={13} /> : <AlertCircle size={13} />}
              {resultMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={reset} className="flex-1 py-2.5 rounded-xl border border-slate-700/60 text-slate-400 hover:text-white text-[11px] font-black uppercase tracking-widest transition-all hover:bg-slate-800/60">
              Try Again
            </button>
            <button
              onClick={handleLog}
              disabled={!effectiveAccount || !parsed?.noteText?.trim() || logging}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
            >
              {logging ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Log It
            </button>
          </div>
        </div>
      )}

      {/* Error without parsed state */}
      {result === "error" && !parsed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-bold">
          <AlertCircle size={13} />
          {resultMsg}
        </div>
      )}
    </div>
  );

  // ── Inline page mode ─────────────────────────────────────────────────────
  if (inline) {
    return (
      <div className="max-w-md mx-auto w-full px-4 pt-6 pb-4">
        {/* Large mic button prompt */}
        {!parsed && !processing && (
          <div className="flex flex-col items-center gap-4 mb-6">
            <button
              onClick={toggleListening}
              disabled={transcribing}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 ${
                transcribing ? "opacity-50 cursor-not-allowed" : listening ? "animate-pulse" : ""
              }`}
              style={{
                background: listening
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: listening
                  ? "0 8px 40px rgba(239,68,68,0.5)"
                  : "0 8px 40px rgba(99,102,241,0.5)",
              }}
            >
              {transcribing
                ? <Loader2 size={32} className="text-white animate-spin" />
                : listening ? <MicOff size={32} className="text-white" />
                : <Mic size={32} className="text-white" />}
            </button>
            <div className="text-center">
              <div className="text-white font-black text-lg tracking-tight">
                {transcribing ? "Transcribing…" : listening ? "Recording… tap to stop" : "Tap to speak"}
              </div>
              <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-0.5">
                {listening ? "tap the mic again when done" : "or type your command below"}
              </div>
            </div>
            {micError && (
              <div className="w-full flex items-start gap-2 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12px] font-medium">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{micError}</span>
              </div>
            )}
          </div>
        )}

        {/* Header when in confirmation state */}
        {(parsed || processing) && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-black text-base tracking-tight">Review & Log</div>
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Confirm the details below</div>
            </div>
          </div>
        )}

        {innerContent}
      </div>
    );
  }

  // ── Floating FAB + modal sheet mode ─────────────────────────────────────
  return (
    <>
      <button
        onClick={handleOpen}
        title="AI Activity Logger"
        className="fixed z-[9999] bottom-24 right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 20px rgba(99,102,241,0.5)" }}
      >
        <Mic size={20} className="text-white" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md mx-auto bg-[#0f172a] border border-slate-700/60 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-8 sm:pb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-white font-black text-base tracking-tight">AI Activity Logger</div>
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Speak or type what happened</div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all">
                <X size={16} />
              </button>
            </div>
            {innerContent}
          </div>
        </div>
      )}
    </>
  );
}

// Small inline account picker for when fuzzy match fails
function AccountSearchPicker({ accounts, onSelect }) {
  const [q, setQ] = useState("");
  const filtered = q.length >= 1
    ? accounts.filter(a => a.name?.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search saved accounts…"
        className="w-full bg-slate-800/70 border border-slate-600/60 rounded-xl px-3 py-2 text-[12px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
      />
      {filtered.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => onSelect(a)}
              className="w-full text-left px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-all"
            >
              <div className="text-white text-[12px] font-bold">{a.name}</div>
              {a.address && <div className="text-slate-500 text-[10px] truncate">{a.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
