import { GoogleGenAI } from "@google/genai";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  History, 
  LogOut, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Camera,
  Car,
  Bike,
  FileText,
  TrendingUp,
  Search,
  MoreVertical,
  X,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DetectionRecord, Stats, ViolationResult } from './types';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, color, subValue }: { icon: any, label: string, value: string | number, color: string, subValue?: string }) => (
  <div className="glass-card p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden group">
    <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
    <div className="flex justify-between items-start">
      <div className={`p-2 rounded-lg ${color.replace('bg-', 'bg-opacity-10 text-')}`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
    </div>
    <div>
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 font-medium">{label}</div>
    </div>
    {subValue && (
      <div className="mt-2 text-xs font-semibold text-slate-500 flex items-center gap-1">
        <TrendingUp size={12} />
        {subValue}
      </div>
    )}
  </div>
);

const CLASS_COLORS: Record<string, string> = {
  'four_wheeler': '#3b82f6', // Blue (Car/Bus)
  'two_wheeler': '#a855f7',  // Purple (Bike)
  'truck': '#f59e0b',        // Orange
  'pedestrian': '#ec4899',   // Pink
  'violation': '#ef4444',    // Red
};

const DetectionOverlay = ({ results, mediaRef, currentTime = 0 }: { results: ViolationResult[], mediaRef: React.RefObject<HTMLImageElement | HTMLVideoElement | null>, currentTime?: number }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (mediaRef.current) {
        setDimensions({
          width: mediaRef.current.clientWidth,
          height: mediaRef.current.clientHeight
        });
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (mediaRef.current) observer.observe(mediaRef.current);
    
    window.addEventListener('resize', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, [mediaRef]);

  const activeResults = useMemo(() => {
    if (!results.some(r => r.timestamp_ms !== undefined)) return results;
    const timeInMs = currentTime * 1000;
    const availableTimestamps = Array.from(new Set(results.map(r => r.timestamp_ms).filter(t => t !== undefined))) as number[];
    if (availableTimestamps.length === 0) return results;
    const closestTimestamp = availableTimestamps.reduce((prev, curr) => {
      return (Math.abs(curr - timeInMs) < Math.abs(prev - timeInMs) ? curr : prev);
    });
    return results.filter(r => r.timestamp_ms === closestTimestamp);
  }, [results, currentTime]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden font-mono">
      {/* OpenCV Style Enforcement Line */}
      <div 
        className="absolute w-full h-[1px] bg-red-500/80 z-10"
        style={{ top: '55%' }}
      >
        <div className="absolute -top-4 left-2 text-[9px] text-red-500 font-bold uppercase">
          cv2.line(frame, (0, y), (w, y), (0,0,255), 2)
        </div>
      </div>

      {activeResults.map((res, idx) => {
        const [ymin, xmin, ymax, xmax] = res.bbox;
        const left = (xmin / 1000) * dimensions.width;
        const top = (ymin / 1000) * dimensions.height;
        const width = ((xmax - xmin) / 1000) * dimensions.width;
        const height = ((ymax - ymin) / 1000) * dimensions.height;

        const isViolation = res.violation_type !== 'NONE';
        const baseColor = CLASS_COLORS[res.vehicle_type] || '#22c55e';
        const color = isViolation ? CLASS_COLORS.violation : baseColor;

        return (
          <React.Fragment key={idx}>
            {/* YOLO Bounding Box */}
            <div 
              style={{
                position: 'absolute',
                left, top, width, height,
                border: `2px solid ${color}`,
                boxShadow: isViolation ? `0 0 10px ${color}44` : 'none'
              }}
            >
              {/* YOLO Label */}
              <div 
                className="absolute -top-[18px] left-[-2px] px-1 text-[10px] font-bold text-white whitespace-nowrap leading-tight"
                style={{ backgroundColor: color }}
              >
                {res.vehicle_type} {Math.round(res.confidence * 100)}%
              </div>
              
              {isViolation && (
                <div className="absolute -bottom-5 left-0 bg-red-600 text-[9px] text-white px-1 font-bold uppercase">
                  {res.violation_type}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [detections, setDetections] = useState<DetectionRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<DetectionRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null);
  const modalMediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null);

  useEffect(() => {
    fetchDetections();
  }, []);

  const fetchDetections = async () => {
    try {
      const res = await fetch('/api/detections');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDetections(data);
      } else {
        console.error('Expected array of detections, got:', data);
        setDetections([]);
      }
    } catch (err) {
      console.error('Failed to fetch detections:', err);
      setDetections([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload the file to get a URL
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      // 2. Perform AI Detection on the Frontend
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API key not found');

      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";

      // Convert file to base64 for Gemini
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });
      const imageData = await base64Promise;

      const prompt = `
        SYSTEM: You are TrafficGuard, a YOLOv8-based traffic analysis engine.
        Analyze this traffic scene using computer vision principles. 
        
        TASK:
        1. Perform object detection for ALL vehicles.
        2. Classify: "four_wheeler", "two_wheeler", "truck", "pedestrian".
        3. Check for violations (NO_HELMET, NO_SEATBELT).
        4. Provide YOLO-standard normalized bounding boxes [ymin, xmin, ymax, xmax] (0-1000).
        
        IF VIDEO:
        - Return temporal detections with "timestamp_ms".
        
        OUTPUT:
        JSON ARRAY of detections.
        {
          "vehicle_type": string,
          "violation_type": "NO_HELMET" | "NO_SEATBELT" | "NONE",
          "confidence": float (0.0-1.0),
          "plate_number": string,
          "fine": number,
          "timestamp_ms": integer,
          "status": "CONFIRMED" | "COMPLIANT",
          "bbox": [ymin, xmin, ymax, xmax]
        }
      `;

      const aiResponse = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: imageData,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      let results = [];
      try {
        const text = aiResponse.text || "[]";
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        results = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiResponse.text);
      }

      // 3. Save the detection record to the server
      const saveRes = await fetch('/api/detections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadData.filename,
          url: uploadData.url,
          results: results,
        }),
      });
      
      const savedData = await saveRes.json();
      setDetections(prev => [savedData, ...prev]);
      setSelectedDetection(savedData);
      setActiveTab('dashboard');
    } catch (err) {
      console.error(err);
      alert('Error: ' + (err instanceof Error ? err.message : 'Failed to process image'));
    } finally {
      setIsUploading(false);
    }
  };

  const stats: Stats = {
    totalScans: Array.isArray(detections) ? detections.length : 0,
    totalViolations: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).filter(r => r.violation_type !== 'NONE').length, 0) : 0,
    noHelmet: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).filter(r => r.violation_type === 'NO_HELMET').length, 0) : 0,
    noSeatbelt: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).filter(r => r.violation_type === 'NO_SEATBELT').length, 0) : 0,
    twoWViolations: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).filter(r => r.vehicle_type === 'two_wheeler' && r.violation_type !== 'NONE').length, 0) : 0,
    fourWViolations: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).filter(r => r.vehicle_type === 'four_wheeler' && r.violation_type !== 'NONE').length, 0) : 0,
    totalFines: Array.isArray(detections) ? detections.reduce((acc, d) => acc + (d.results || []).reduce((sum, r) => sum + (r.fine || 0), 0), 0) : 0,
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 flex flex-col p-6 gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Shield className="text-white" size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">TrafficGuard</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Surveillance</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={Upload} 
            label="New Detection" 
            active={activeTab === 'new'} 
            onClick={() => setActiveTab('new')} 
          />
          <SidebarItem 
            icon={History} 
            label="History" 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
          />
        </nav>

        <div className="pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-3 text-slate-400">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">System Online</span>
          </div>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-bold text-white capitalize">{activeTab}</h2>
            <p className="text-slate-500 text-sm">Welcome back, Officer Siva</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Search records..." 
                className="bg-slate-900 border border-slate-800 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 transition-colors w-64"
              />
            </div>
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">S</div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <StatCard icon={Camera} label="Total Scans" value={stats.totalScans} color="bg-blue-600" />
              <StatCard icon={AlertTriangle} label="Total Violations" value={stats.totalViolations} color="bg-red-500" />
              <StatCard icon={Shield} label="No Helmet" value={stats.noHelmet} color="bg-orange-500" />
              <StatCard icon={Car} label="No Seatbelt" value={stats.noSeatbelt} color="bg-orange-500" />
              <StatCard icon={Bike} label="2W Violations" value={stats.twoWViolations} color="bg-purple-500" />
              <StatCard icon={Car} label="4W Violations" value={stats.fourWViolations} color="bg-purple-500" />
              <StatCard icon={FileText} label="Total Fines" value={`₹${stats.totalFines.toLocaleString()}`} color="bg-emerald-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Quick Actions & Upload */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-500" />
                    Quick Actions
                  </h3>
                  <div className="flex flex-col gap-3">
                    <label className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl cursor-pointer transition-all">
                      {isUploading ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
                      {isUploading ? 'Processing...' : 'Upload Image / Video'}
                      <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*" disabled={isUploading} />
                    </label>
                    <button 
                      onClick={() => setActiveTab('history')}
                      className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                    >
                      <History size={20} />
                      View All History
                    </button>
                  </div>
                </div>

                {/* Selected Detection Preview */}
                <AnimatePresence>
                  {selectedDetection && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="glass-card rounded-2xl overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="text-white font-bold text-sm">Active Detection</h3>
                        <button onClick={() => setSelectedDetection(null)} className="text-slate-500 hover:text-white">
                          <X size={18} />
                        </button>
                      </div>
                      <div className="relative cursor-zoom-in" onClick={() => setIsModalOpen(true)}>
                        {selectedDetection.url.toLowerCase().endsWith('.mp4') || selectedDetection.url.toLowerCase().endsWith('.webm') ? (
                          <div className="relative">
                            <video 
                              ref={mediaRef as React.RefObject<HTMLVideoElement>}
                              src={selectedDetection.url} 
                              controls 
                              autoPlay 
                              muted 
                              loop 
                              onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                              className="w-full h-auto block"
                            />
                            <div className="absolute top-4 right-4 bg-blue-600/80 backdrop-blur-md text-[10px] font-bold text-white px-2 py-1 rounded-full flex items-center gap-1 z-20">
                              <Clock size={10} />
                              LIVE AI TRACKING
                            </div>
                          </div>
                        ) : (
                          <img 
                            ref={mediaRef as React.RefObject<HTMLImageElement>}
                            src={selectedDetection.url} 
                            alt="Detection" 
                            referrerPolicy="no-referrer"
                            className="w-full h-auto block"
                            onError={(e) => {
                              console.error("Image failed to load:", selectedDetection.url);
                              e.currentTarget.src = "https://picsum.photos/seed/error/800/600?blur=2";
                            }}
                          />
                        )}
                        <DetectionOverlay results={selectedDetection.results} mediaRef={mediaRef} currentTime={videoTime} />
                        
                        {/* Status Bar Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 status-bar-red p-2 flex justify-between items-center text-[10px] font-bold text-white">
                          <div className="flex gap-4">
                            <span>CAM-001</span>
                            <span>{new Date(selectedDetection.timestamp).toLocaleString()}</span>
                            <span>MG ROAD JUNCTION</span>
                          </div>
                          <div className="flex gap-4">
                            <span>VIOLATIONS: {(selectedDetection.results || []).filter(r => r.violation_type !== 'NONE').length}</span>
                            <span>ID: {(selectedDetection.id || '').slice(-5)}</span>
                          </div>
                        </div>
                      </div>
                      {/* Simulated YOLO Console */}
                  <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-[300px]">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span className="ml-2 text-[10px] font-mono text-slate-500 uppercase tracking-widest">yolo_v8_engine.py</span>
                      </div>
                      <span className="text-[10px] font-mono text-blue-500">RUNNING</span>
                    </div>
                    <div className="p-4 font-mono text-[10px] text-emerald-500 overflow-y-auto flex-1 bg-black/40">
                      <p className="mb-1 text-slate-500">[{new Date().toISOString().replace('T', ' ').slice(0, 19)}] INFO: Initializing YOLOv8 weights...</p>
                      <p className="mb-1 text-slate-500">[{new Date().toISOString().replace('T', ' ').slice(0, 19)}] INFO: Loading OpenCV backend (CUDA enabled)</p>
                      <p className="mb-1 text-blue-400">[{new Date().toISOString().replace('T', ' ').slice(0, 19)}] DEBUG: Processing input stream: {selectedDetection.filename}</p>
                      <p className="mb-1">[{new Date().toISOString().replace('T', ' ').slice(0, 19)}] SUCCESS: Model loaded. Starting inference...</p>
                      <div className="mt-4 space-y-1">
                        {(selectedDetection.results || []).map((r, i) => (
                          <p key={i} className={r.violation_type !== 'NONE' ? 'text-red-400' : 'text-emerald-500'}>
                            {`> [FRAME ${Math.floor(videoTime * 30)}] DETECTED: ${r.vehicle_type} | CONF: ${r.confidence.toFixed(2)} | VIOLATION: ${r.violation_type}`}
                          </p>
                        ))}
                      </div>
                      <p className="mt-4 animate-pulse">_</p>
                    </div>
                  </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Recent Detections Table */}
              <div className="lg:col-span-2">
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <Clock size={18} className="text-blue-500" />
                      Recent Detections
                    </h3>
                    <button onClick={() => setActiveTab('history')} className="text-blue-500 text-sm font-bold hover:underline">View All →</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
                          <th className="px-6 py-4">File</th>
                          <th className="px-6 py-4">Violations</th>
                          <th className="px-6 py-4">Fine</th>
                          <th className="px-6 py-4">Time</th>
                          <th className="px-6 py-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(detections) && detections.slice(0, 10).map((det) => {
                          const violationCount = (det.results || []).filter(r => r.violation_type !== 'NONE').length;
                          const totalFine = (det.results || []).reduce((sum, r) => sum + (r.fine || 0), 0);
                          
                          return (
                            <tr 
                              key={det.id} 
                              className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                              onClick={() => setSelectedDetection(det)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center overflow-hidden">
                                    <img src={det.url} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                  <span className="text-sm font-medium text-slate-300">{(det.filename || '').slice(0, 15)}...</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {violationCount > 0 ? (
                                  <span className="px-2 py-1 rounded bg-red-500/10 text-red-500 text-[10px] font-bold border border-red-500/20">
                                    {violationCount} Violations
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">
                                    Clean
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-white">₹{totalFine}</td>
                              <td className="px-6 py-4 text-xs text-slate-500">{new Date(det.timestamp).toLocaleString()}</td>
                              <td className="px-6 py-4 text-right">
                                <button className="text-slate-600 hover:text-white">
                                  <MoreVertical size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {detections.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-slate-500 italic">
                              No detections recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="glass-card rounded-2xl overflow-hidden">
             <div className="p-6 border-b border-slate-800">
                <h3 className="text-white font-bold">Detection History</h3>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
                {Array.isArray(detections) && detections.map(det => (
                  <div 
                    key={det.id} 
                    className="glass-card rounded-xl overflow-hidden group cursor-pointer hover:border-blue-600/50 transition-all"
                    onClick={() => {
                      setSelectedDetection(det);
                      setActiveTab('dashboard');
                    }}
                  >
                    <div className="aspect-video relative">
                      {det.url.toLowerCase().endsWith('.mp4') || det.url.toLowerCase().endsWith('.webm') ? (
                        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                          <video src={det.url} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                              <Camera size={20} className="text-white" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img src={det.url} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-2 right-2">
                        {det.results.some(r => r.violation_type !== 'NONE') ? (
                          <AlertTriangle size={20} className="text-red-500 fill-red-500/20" />
                        ) : (
                          <CheckCircle2 size={20} className="text-emerald-500 fill-emerald-500/20" />
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-slate-500 mb-1">{new Date(det.timestamp).toLocaleString()}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-white">₹{(det.results || []).reduce((s, r) => s + (r.fine || 0), 0)} Fine</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{(det.results || []).length} Vehicles</span>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'new' && (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
            <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-600 animate-pulse">
              <Upload size={48} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Upload Traffic Data</h3>
              <p className="text-slate-500 max-w-md">Upload images or videos of traffic flow. TrafficGuard will automatically detect vehicles and flag violations based on enforcement rules.</p>
            </div>
            <label className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-xl cursor-pointer transition-all shadow-lg shadow-blue-600/20">
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
              {isUploading ? 'Processing...' : 'Select Files to Analyze'}
              <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*" disabled={isUploading} />
            </label>
          </div>
        )}
      </main>

      {/* Full Screen Modal View */}
      <AnimatePresence>
        {isModalOpen && selectedDetection && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-10"
          >
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-white/50 hover:text-white z-50 bg-white/10 p-2 rounded-full backdrop-blur-md transition-all"
            >
              <X size={32} />
            </button>

            <div className="relative w-full max-w-6xl aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              {selectedDetection.url.toLowerCase().endsWith('.mp4') || selectedDetection.url.toLowerCase().endsWith('.webm') ? (
                <div className="relative w-full h-full">
                  <video 
                    ref={modalMediaRef as React.RefObject<HTMLVideoElement>}
                    src={selectedDetection.url} 
                    controls 
                    autoPlay 
                    muted 
                    loop 
                    onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-6 left-6 bg-blue-600/80 backdrop-blur-md text-xs font-bold text-white px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
                    <Clock size={14} />
                    DYNAMIC AI TRACKING ACTIVE
                  </div>
                </div>
              ) : (
                <img 
                  ref={modalMediaRef as React.RefObject<HTMLImageElement>}
                  src={selectedDetection.url} 
                  alt="Full View" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              )}
              <DetectionOverlay results={selectedDetection.results} mediaRef={modalMediaRef} currentTime={videoTime} />
              
              {/* Status Bar Overlay (Large) */}
              <div className="absolute bottom-0 left-0 right-0 status-bar-red p-4 flex justify-between items-center text-xs font-bold text-white">
                <div className="flex gap-8">
                  <span className="flex items-center gap-2"><Camera size={14}/> CAM-001</span>
                  <span>{new Date(selectedDetection.timestamp).toLocaleString()}</span>
                  <span>MG ROAD JUNCTION</span>
                </div>
                <div className="flex gap-8">
                  <span className="bg-white/20 px-2 py-0.5 rounded">VIOLATIONS: {(selectedDetection.results || []).filter(r => r.violation_type !== 'NONE').length}</span>
                  <span>ID: {(selectedDetection.id || '').slice(-5)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
