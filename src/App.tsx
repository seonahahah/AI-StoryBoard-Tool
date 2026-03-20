import React, { useState, useRef, useEffect } from 'react';
import { 
  Clapperboard, 
  Plus, 
  Save, 
  FolderOpen, 
  FileText, 
  RefreshCw, 
  Camera, 
  Trash2, 
  Copy, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Smartphone,
  Square,
  Maximize,
  Film,
  Clock,
  Activity,
  Hash,
  Timer,
  Image as ImageIcon,
  X,
  Upload,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from './lib/supabase';

// --- Types ---
interface Shot {
  id: string;
  scene: number;
  shot: number;
  title: string;
  description: string;
  duration: string;
  shotSize: string;
  cameraAngle: string;
  lens: string;
  movement: string;
  ratio: string;
  colorPalette: string;
  note: string;
  referenceImage?: string;
}

interface PromptData {
  prompt: string;
  negativePrompt: string;
}

interface ProjectData {
  projectTitle: string;
  scenarioText: string;
  aspectRatio: string;
  shotList: Shot[];
  storyboardPrompts: Record<string, PromptData>;
  finalImages?: Record<string, string>;
}

// --- Constants ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 무료 티어 일일 한도 (gemini-1.5-pro 기준 50회, flash 기준 1500회)
// gemini-3.1-pro-preview 기준으로 보수적으로 50으로 설정
const DAILY_LIMIT = 250;
const STORAGE_KEY = 'gemini_usage';

const RATIOS = [
  { label: '16:9', value: '16:9', icon: <Monitor size={16} /> },
  { label: '9:16', value: '9:16', icon: <Smartphone size={16} /> },
  { label: '1:1', value: '1:1', icon: <Square size={16} /> },
  { label: '4:3', value: '4:3', icon: <Maximize size={16} /> },
  { label: '2.39:1', value: '2.39:1', icon: <Film size={16} /> },
];

const SHOT_SIZES = ['Extreme Long Shot','Long Shot','Medium Shot','Medium Close-up','Close-up','Extreme Close-up'];
const CAMERA_ANGLES = ["High Angle","Eye-level","Low Angle","Bird's-eye view","Over the shoulder","Dutch angle"];
const LENSES = ['14mm','24mm','35mm','50mm','85mm','100mm','135mm'];

// --- Usage Counter Helpers ---
function getUsageData(): { date: string; count: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { date: '', count: 0 };
}

function incrementUsage(): number {
  const today = new Date().toISOString().slice(0, 10);
  const data = getUsageData();
  const newCount = data.date === today ? data.count + 1 : 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: newCount }));
  return newCount;
}

function getTodayUsage(): number {
  const today = new Date().toISOString().slice(0, 10);
  const data = getUsageData();
  return data.date === today ? data.count : 0;
}

async function compressImage(
  base64: string,
  maxWidth = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64;
  });
}

const formatDate = (isoString: string) => {
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
};

// --- Usage Badge Component ---
function UsageBadge({ count, limit }: { count: number; limit: number }) {
  const remaining = limit - count;
  const percent = (count / limit) * 100;

  const color =
    percent >= 90 ? 'text-red-400 border-red-500/40 bg-red-500/10' :
    percent >= 70 ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' :
    'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';

  const barColor =
    percent >= 90 ? 'bg-red-500' :
    percent >= 70 ? 'bg-yellow-400' :
    'bg-emerald-400';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${color}`}>
      <Zap size={13} />
      <span>오늘 {count} / {limit}회</span>
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="opacity-70">잔여 {remaining}회</span>
    </div>
  );
}

// --- Quota Error Banner Component ---
function QuotaBanner({ retrySeconds, onDismiss }: { retrySeconds: number; onDismiss: () => void }) {
  const [seconds, setSeconds] = useState(retrySeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onDismiss();
      return;
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm"
    >
      <AlertCircle className="text-red-400 shrink-0" size={18} />
      <div className="flex-1">
        <span className="font-bold text-red-400">일일 입력 토큰 수가 초과되었습니다.</span>
        {seconds > 0 ? (
          <span className="text-red-300 ml-2">
            {seconds}초 후에 다시 시도해주세요.
          </span>
        ) : (
          <span className="text-emerald-400 ml-2 font-bold">✓ 다시 시도할 수 있습니다!</span>
        )}
      </div>
      {seconds <= 0 && (
        <button
          onClick={onDismiss}
          className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors text-xs font-bold"
        >
          닫기
        </button>
      )}
    </motion.div>
  );
}

// --- App Component ---
export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectTitle, setProjectTitle] = useState('');
  const [scenarioText, setScenarioText] = useState('');
  const [scenarioMode, setScenarioMode] = useState<'text' | 'visual'>('text');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [shotList, setShotList] = useState<Shot[]>([]);
  const [storyboardPrompts, setStoryboardPrompts] = useState<Record<string, PromptData>>({});
  const [finalImages, setFinalImages] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // --- NEW: Usage & Quota state ---
  const [usageCount, setUsageCount] = useState(getTodayUsage());
  const [quotaError, setQuotaError] = useState<{ retrySeconds: number } | null>(null);

  const [showConfirm, setShowConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [showCloudListModal, setShowCloudListModal] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const pdfExportRef = useRef<HTMLDivElement>(null);

  // --- Usage helpers ---
  const trackApiCall = () => {
    const newCount = incrementUsage();
    setUsageCount(newCount);
    return newCount;
  };

  // 할당량 초과 오류 파싱
  const handleApiError = (err: any) => {
    const msg = err?.message || '';
    const isQuota =
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('429') ||
      err?.status === 429 ||
      err?.code === 429;

    if (isQuota) {
      // retryDelay 파싱 (없으면 기본 6초)
      const delayMatch = msg.match(/"retryDelay":"(\d+)s"/);
      const retrySeconds = delayMatch ? parseInt(delayMatch[1]) : 6;
      setQuotaError({ retrySeconds });
      setError(null); // 일반 에러 대신 배너로 처리
      return true;
    }
    return false;
  };

  // --- Supabase Functions ---
  const fetchProjectList = async () => {
    try {
      const { data, error } = await supabase
        .from('storyboard_projects')
        .select('id, title, project_title, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setProjectList(data || []);
    } catch (err) {
      console.error('Error fetching project list:', err);
    }
  };

  const saveToSupabase = async () => {
    try {
      showToast('이미지 압축 중...', 'success');

      const compressedFinalImages: Record<string, string> = {};
      for (const [key, img] of Object.entries(finalImages)) {
        compressedFinalImages[key] = await compressImage(img as string, 800, 0.7);
      }

      const compressedShotList = await Promise.all(
        shotList.map(async (shot) => {
          if (shot.referenceImage) {
            return {
              ...shot,
              referenceImage: await compressImage(shot.referenceImage as string, 600, 0.7)
            };
          }
          return shot;
        })
      );

      showToast('저장 중...', 'success');

      const payload = {
        title: projectTitle || 'Untitled',
        project_title: projectTitle,
        scenario_text: scenarioText,
        aspect_ratio: aspectRatio,
        shot_list: compressedShotList,
        storyboard_prompts: storyboardPrompts,
        final_images: compressedFinalImages,
        current_step: currentStep,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('storyboard_projects')
        .insert(payload)
        .select()
        .single();

      if (data) setCurrentProjectId(data.id);
      if (error) {
        showToast('저장 실패: ' + error.message, 'error');
        return;
      }

      const trimOldProjects = async () => {
        const { data } = await supabase
          .from('storyboard_projects')
          .select('id, created_at')
          .order('created_at', { ascending: true });

        if (data && data.length > 10) {
          const toDelete = data.slice(0, data.length - 10);
          const idsToDelete = toDelete.map(p => p.id);
          await supabase
            .from('storyboard_projects')
            .delete()
            .in('id', idsToDelete);
        }
      };
      await trimOldProjects();

      showToast('저장되었습니다 ✓');
      fetchProjectList();
      setShowSaveMenu(false);
    } catch (err: any) {
      console.error('Error saving to Supabase:', err);
      showToast('저장 실패: ' + err.message, 'error');
    }
  };

  const loadFromSupabase = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('storyboard_projects')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      if (data) {
        setProjectTitle(data.project_title || '');
        setScenarioText(data.scenario_text || '');
        setAspectRatio(data.aspect_ratio || '16:9');
        setShotList(data.shot_list || []);
        setStoryboardPrompts(data.storyboard_prompts || {});
        setFinalImages(data.final_images || {});
        setCurrentStep(data.current_step || 1);
        setCurrentProjectId(data.id);
        showToast('불러왔습니다 ✓');
        setShowCloudListModal(false);
        setShowLoadMenu(false);
      }
    } catch (err: any) {
      console.error('Error loading from Supabase:', err);
      showToast('불러오기 실패: ' + err.message, 'error');
    }
  };

  const deleteFromSupabase = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const { error } = await supabase
        .from('storyboard_projects')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      if (currentProjectId === id) setCurrentProjectId(null);
      fetchProjectList();
      showToast('삭제되었습니다');
    } catch (err: any) {
      console.error('Error deleting from Supabase:', err);
      showToast('삭제 실패: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    fetchProjectList();
  }, []);

  // --- Helpers ---
  const parseDuration = (durationStr: string): number => {
    const match = durationStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const totalSeconds = shotList.reduce((acc, shot) => acc + parseDuration(shot.duration), 0);
  const avgSeconds = shotList.length > 0 ? (totalSeconds / shotList.length).toFixed(1) : 0;
  const progressPercent = Math.min((totalSeconds / 120) * 100, 100);

  // --- AI Logic ---
  const handleGenerateShotList = async () => {
    if (!GEMINI_API_KEY) {
      setError('Gemini API 키가 설정되지 않았습니다.');
      return;
    }
    if (!scenarioText.trim()) {
      setError('시나리오를 먼저 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setQuotaError(null);

    try {
      const parts: any[] = [];

      if (scenarioMode === 'visual' && referenceImages.length > 0) {
        for (const img of referenceImages) {
          try {
            const [header, data] = img.split(',');
            const mimeType = header.split(':')[1].split(';')[0];
            parts.push({ inlineData: { mimeType, data } });
          } catch (e) {
            console.error('이미지 파싱 오류:', e);
          }
        }
        parts.push({
          text: `당신은 전문 영화 촬영 감독 및 스토리보드 아티스트입니다. 
제공된 레퍼런스 이미지들의 색감, 구도, 조명, 분위기를 깊이 있게 분석하여 아래 시나리오 설명에 어울리는 상세한 샷 리스트를 생성하세요.

프로젝트: ${projectTitle || 'Untitled'}
시나리오 설명:
${scenarioText}

반드시 아래 JSON 형식만 출력하세요:
{
  "shots": [
    {
      "scene": 1, "shot": 1, "title": "씬 제목",
      "description": "상세 설명 (한국어, 2-3문장)",
      "duration": "5 seconds", "shotSize": "Extreme Long Shot",
      "cameraAngle": "High Angle", "lens": "24mm", "movement": "Static",
      "ratio": "${aspectRatio}", "colorPalette": "이미지에서 분석된 색감", "note": "촬영 주의사항"
    }
  ]
}
최소 5개 이상의 샷을 생성하세요.`
        });
      } else {
        parts.push({
          text: `당신은 전문 영화 촬영 감독 및 스토리보드 아티스트입니다.
아래 시나리오를 분석하여 상세한 샷 리스트를 JSON 형식으로 생성하세요.

프로젝트: ${projectTitle || 'Untitled'}
시나리오:
${scenarioText}

반드시 아래 JSON 형식만 출력하세요:
{
  "shots": [
    {
      "scene": 1, "shot": 1, "title": "씬 제목",
      "description": "상세 설명 (한국어, 2-3문장)",
      "duration": "5 seconds", "shotSize": "Extreme Long Shot",
      "cameraAngle": "High Angle", "lens": "24mm", "movement": "Static",
      "ratio": "${aspectRatio}", "colorPalette": "차갑고 어두운", "note": "촬영 주의사항"
    }
  ]
}
최소 5개 이상의 샷을 생성하세요.`
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scene: { type: Type.INTEGER },
                    shot: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    shotSize: { type: Type.STRING },
                    cameraAngle: { type: Type.STRING },
                    lens: { type: Type.STRING },
                    movement: { type: Type.STRING },
                    ratio: { type: Type.STRING },
                    colorPalette: { type: Type.STRING },
                    note: { type: Type.STRING }
                  },
                  required: ["scene","shot","title","description","duration","shotSize","cameraAngle","lens","movement","ratio","colorPalette"]
                }
              }
            },
            required: ["shots"]
          }
        }
      });

      // API 호출 성공 시 카운트 증가
      trackApiCall();

      if (!response.text) throw new Error('AI 응답이 비어 있습니다.');
      const data = JSON.parse(response.text);
      if (!data.shots || !Array.isArray(data.shots)) throw new Error('올바르지 않은 데이터 형식입니다.');

      setShotList(data.shots.map((s: any) => ({
        ...s,
        id: Math.random().toString(36).substring(2, 11)
      })));
      setCurrentStep(2);
      showToast('샷 리스트가 생성되었습니다!');
    } catch (err: any) {
      console.error('Shot list generation error:', err);
      if (!handleApiError(err)) {
        setError('샷 리스트 생성 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
        showToast('샷 리스트 생성 실패', 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const generatePromptForShot = async (shot: Shot): Promise<PromptData> => {
    if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 없습니다.');

    const promptText = `당신은 AI 이미지 생성 전문가(Midjourney, DALL-E 3)입니다.
아래 영화 샷 정보를 기반으로 시각적으로 매우 상세한 이미지 생성 프롬프트를 작성하세요.

[샷 정보]
프로젝트: ${projectTitle || 'Untitled'}
Scene ${shot.scene} Shot ${shot.shot}: ${shot.title}
설명: ${shot.description}
샷 크기: ${shot.shotSize}
카메라 앵글: ${shot.cameraAngle}
렌즈: ${shot.lens}
색감/분위기: ${shot.colorPalette}
카메라 무브먼트: ${shot.movement}
기타 참고: ${shot.note || '없음'}

1. 'prompt'는 반드시 영어로 작성하세요. (120-160단어)
2. 구도, 조명, 질감, 스타일을 구체적으로 묘사하세요.
3. 'negativePrompt'에는 제외할 요소를 영어로 작성하세요.
${shot.referenceImage ? "4. 첨부된 레퍼런스 이미지의 스타일을 반영하세요." : ""}

반드시 아래 JSON 형식만 출력하세요:
{"prompt": "상세한 영문 프롬프트", "negativePrompt": "제외할 요소들"}`;

    const parts: any[] = [{ text: promptText }];
    
    if (shot.referenceImage) {
      try {
        const base64Data = shot.referenceImage.split(',')[1];
        const mimeType = shot.referenceImage.split(';')[0].split(':')[1] || 'image/jpeg';
        parts.push({ inlineData: { mimeType, data: base64Data } });
      } catch (e) {
        console.error('레퍼런스 이미지 처리 오류:', e);
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            negativePrompt: { type: Type.STRING }
          },
          required: ["prompt", "negativePrompt"]
        }
      }
    });

    if (!response.text) throw new Error('AI 응답이 비어 있습니다.');
    
    // 성공 시 카운트 증가
    trackApiCall();
    
    return JSON.parse(response.text);
  };

  const handleGenerateSinglePrompt = async (shot: Shot) => {
    const key = `${shot.scene}-${shot.shot}`;
    setIsGenerating(true);
    setGenerationProgress(0);
    setError(null);
    setQuotaError(null);

    try {
      const result = await generatePromptForShot(shot);
      setStoryboardPrompts(prev => ({ ...prev, [key]: result }));
      showToast(`Scene ${shot.scene} Shot ${shot.shot} 프롬프트 생성 완료!`);
    } catch (err: any) {
      console.error(err);
      if (!handleApiError(err)) {
        showToast('프롬프트 생성 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleCreateStoryboard = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setError(null);
    setQuotaError(null);
    setCurrentStep(3);

    const newPrompts: Record<string, PromptData> = { ...storyboardPrompts };

    for (let i = 0; i < shotList.length; i++) {
      const shot = shotList[i];
      const key = `${shot.scene}-${shot.shot}`;

      try {
        const result = await generatePromptForShot(shot);
        newPrompts[key] = result;
        setStoryboardPrompts({ ...newPrompts });
      } catch (err: any) {
        console.error(`Error generating prompt for shot ${key}:`, err);
        if (handleApiError(err)) break; // 할당량 초과면 중단
      }
      if (i < shotList.length - 1) {
  await new Promise(resolve => setTimeout(resolve, 3000));
}
      setGenerationProgress(Math.round(((i + 1) / shotList.length) * 100));
    }

    setIsGenerating(false);
    if (!quotaError) showToast('스토리보드 프롬프트 생성이 완료되었습니다!');
  };

  // --- Actions ---
  const newProject = () => {
    setShowConfirm({
      message: '새 프로젝트를 시작하시겠습니까? 현재 작업 내용이 사라질 수 있습니다.',
      onConfirm: () => {
        setProjectTitle('');
        setScenarioText('');
        setShotList([]);
        setStoryboardPrompts({});
        setFinalImages({});
        setCurrentStep(1);
        setCurrentProjectId(null);
        setShowConfirm(null);
      }
    });
  };

  const saveProject = () => {
    const data: ProjectData = { projectTitle, scenarioText, aspectRatio, shotList, storyboardPrompts, finalImages };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle || 'project'}.storyboard.json`;
    a.click();
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d: ProjectData = JSON.parse(ev.target?.result as string);
        setProjectTitle(d.projectTitle || '');
        setScenarioText(d.scenarioText || '');
        setAspectRatio(d.aspectRatio || '16:9');
        const loadedShots = (d.shotList || []).map(s => ({
          ...s,
          id: s.id || Math.random().toString(36).substring(2, 11)
        }));
        setShotList(loadedShots);
        setStoryboardPrompts(d.storyboardPrompts || {});
        setFinalImages(d.finalImages || {});
        setCurrentStep(loadedShots.length ? 2 : 1);
        setCurrentProjectId(null);
        showToast('프로젝트를 불러왔습니다 ✓');
        e.target.value = '';
      } catch {
        setError('프로젝트 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file);
  };

  const uploadTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScenarioText(ev.target?.result as string);
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  const addShot = () => {
    const last = shotList[shotList.length - 1] || { scene: 1, shot: 0 };
    const newShot: Shot = {
      id: Math.random().toString(36).substring(2, 11),
      scene: last.scene,
      shot: last.shot + 1,
      title: '새 샷',
      description: '새로운 샷 설명을 입력하세요.',
      duration: '3 seconds',
      shotSize: 'Medium Shot',
      cameraAngle: 'Eye-level',
      lens: '50mm',
      movement: 'Static',
      ratio: aspectRatio,
      colorPalette: '따뜻하고 밝은',
      note: ''
    };
    setShotList([...shotList, newShot]);
  };

  const deleteShot = (idx: number) => {
    setShowConfirm({
      message: '이 샷을 삭제하시겠습니까?',
      onConfirm: () => {
        const newList = [...shotList];
        newList.splice(idx, 1);
        setShotList(newList);
        setShowConfirm(null);
      }
    });
  };

  const duplicateShot = (idx: number) => {
    const copy = { ...shotList[idx], id: Math.random().toString(36).substring(2, 11), shot: shotList[idx].shot + 1 };
    const newList = [...shotList];
    newList.splice(idx + 1, 0, copy);
    setShotList(newList);
  };

  const updateShot = (idx: number, field: keyof Shot, value: any) => {
    const newList = [...shotList];
    newList[idx] = { ...newList[idx], [field]: value };
    setShotList(newList);
  };

  const updateShotNumber = (idx: number, field: 'scene' | 'shot', value: number) => {
    const oldShot = shotList[idx];
    const oldKey = `${oldShot.scene}-${oldShot.shot}`;
    const newList = [...shotList];
    const newShot = { ...oldShot, [field]: value };
    newList[idx] = newShot;
    setShotList(newList);
    const newKey = `${newShot.scene}-${newShot.shot}`;
    if (oldKey !== newKey) {
      if (storyboardPrompts[oldKey]) {
        setStoryboardPrompts(prev => {
          const next = { ...prev };
          next[newKey] = next[oldKey];
          const stillUsed = newList.some((s, i) => i !== idx && `${s.scene}-${s.shot}` === oldKey);
          if (!stillUsed) delete next[oldKey];
          return next;
        });
      }
      if (finalImages[oldKey]) {
        setFinalImages(prev => {
          const next = { ...prev };
          next[newKey] = next[oldKey];
          const stillUsed = newList.some((s, i) => i !== idx && `${s.scene}-${s.shot}` === oldKey);
          if (!stillUsed) delete next[oldKey];
          return next;
        });
      }
    }
  };

  const moveShot = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === shotList.length - 1) return;
    const newList = [...shotList];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    setShotList(newList);
  };

  const exportToPDF = async () => {
    if (shotList.length === 0) return;
    setIsExporting(true);
    try {
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      // @ts-ignore
      const html2canvas = window.html2canvas;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = 297;
      const pageHeight = 210;
      const marginX = 8;
      const marginTop = 20;
      const marginBottom = 10;
      const gap = 2;
      const cardWidth = (pageWidth - (marginX * 2) - (gap * 3)) / 4;
      const cardHeight = (pageHeight - marginTop - marginBottom - gap) / 2;
      const today = new Date().toLocaleDateString();
      const totalShots = shotList.length;
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '400px';
      document.body.appendChild(container);

      for (let i = 0; i < shotList.length; i++) {
        const shot = shotList[i];
        const key = `${shot.scene}-${shot.shot}`;
        const finalImage = finalImages[key];
        const cardsPerPage = 8;
        const cardIdxOnPage = i % cardsPerPage;
        const col = cardIdxOnPage % 4;
        const row = Math.floor(cardIdxOnPage / 4);
        if (i > 0 && cardIdxOnPage === 0) doc.addPage();
        container.innerHTML = `
          <div id="pdf-card" style="width:400px;height:512px;background:white;color:black;padding:16px;font-family:'Noto Sans KR',sans-serif;display:flex;flex-direction:column;box-sizing:border-box;">
            <div style="font-size:10px;color:#888;margin-bottom:6px;font-weight:500;">S${shot.scene}-SH${shot.shot}</div>
            <div style="width:100%;height:256px;background:#f2f2f2;margin-bottom:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:2px;">
              ${finalImage ? `<img src="${finalImage}" style="width:100%;height:100%;object-fit:cover;" />` : `<span style="color:#ccc;font-size:14px;">No Image</span>`}
            </div>
            <div style="font-size:14px;font-weight:800;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#111;">${shot.title}</div>
            <div style="font-size:10px;line-height:1.4;color:#555;margin-bottom:8px;height:28px;overflow:hidden;">${shot.description}</div>
            <div style="margin-top:auto;border-top:1px solid #f0f0f0;padding-top:6px;">
              <span style="font-size:8px;color:#999;font-weight:500;">${shot.shotSize} / ${shot.cameraAngle} / ${shot.lens} / ${shot.duration}</span>
            </div>
          </div>`;
        const cardEl = container.querySelector('#pdf-card') as HTMLElement;
        const canvas = await html2canvas(cardEl, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const x = marginX + (col * (cardWidth + gap));
        const y = marginTop + (row * (cardHeight + gap));
        doc.addImage(imgData, 'JPEG', x, y, cardWidth, cardHeight);
        if (cardIdxOnPage === 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text(`${projectTitle || 'Untitled Storyboard'}`, marginX, 12);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text(`${today} | Total ${totalShots} Shots`, pageWidth - marginX, 12, { align: 'right' });
          doc.setDrawColor(230);
          doc.setLineWidth(0.2);
          doc.line(marginX, 15, pageWidth - marginX, 15);
          const pageNum = Math.floor(i / cardsPerPage) + 1;
          const totalPages = Math.ceil(shotList.length / cardsPerPage);
          doc.setFontSize(6);
          doc.setTextColor(150, 150, 150);
          doc.text(`${pageNum} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
      }
      document.body.removeChild(container);
      doc.save(`${projectTitle || 'Untitled'}_storyboard.pdf`);
      showToast('PDF 내보내기가 완료되었습니다.');
    } catch (err) {
      console.error(err);
      setError('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0c1a] text-slate-200 font-sans selection:bg-violet-500/30">
      {/* --- Header --- */}
      <header className="sticky top-0 z-50 bg-[#0f0c1a]/95 border-b border-violet-500/20 px-6" style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Clapperboard className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                  AI Storyboard Generator
                </h1>
              </div>
            </div>

            {/* ✅ NEW: Usage Badge in header center */}
            <div className="flex items-center gap-2">
              <UsageBadge count={usageCount} limit={DAILY_LIMIT} />
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={newProject}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium text-slate-300"
              >
                <Plus size={16} /> 새 프로젝트
              </button>
              <div className="relative">
                <button 
                  onClick={() => { setShowSaveMenu(!showSaveMenu); setShowLoadMenu(false); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium text-slate-300"
                >
                  <Save size={16} /> 저장 <ChevronDown size={14} className={`transition-transform ${showSaveMenu ? 'rotate-180' : ''}`} />
                </button>
                {showSaveMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSaveMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-[#1a1625] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                      <button onClick={() => { saveProject(); setShowSaveMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left">
                        <Download size={16} className="text-violet-400" /><span>💾 파일로 저장</span>
                      </button>
                      <button onClick={saveToSupabase} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left">
                        <Activity size={16} className="text-emerald-400" /><span>☁️ 클라우드 저장</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <button 
                  onClick={() => { setShowLoadMenu(!showLoadMenu); setShowSaveMenu(false); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium text-slate-300"
                >
                  <FolderOpen size={16} /> 불러오기 <ChevronDown size={14} className={`transition-transform ${showLoadMenu ? 'rotate-180' : ''}`} />
                </button>
                {showLoadMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowLoadMenu(false)} />
                    <div className="absolute right-0 mt-2 w-72 bg-[#1a1625] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col">
                      <div className="p-1 border-b border-white/5">
                        <button onClick={() => { loadInputRef.current?.click(); setShowLoadMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left rounded-lg">
                          <Upload size={16} className="text-violet-400" /><span>📂 파일로 불러오기</span>
                        </button>
                        <button onClick={() => { setShowCloudListModal(true); setShowLoadMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left rounded-lg">
                          <Activity size={16} className="text-emerald-400" /><span>☁️ 클라우드 목록</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <input ref={loadInputRef} type="file" accept=".json" className="hidden" onChange={loadProject} />
            </div>
          </div>

          {/* ✅ NEW: Quota Error Banner */}
          <AnimatePresence>
            {quotaError && (
              <div className="pb-3">
                <QuotaBanner
                  retrySeconds={quotaError.retrySeconds}
                  onDismiss={() => setQuotaError(null)}
                />
              </div>
            )}
          </AnimatePresence>

          <nav className="flex gap-1">
            {[
              { id: 1, label: '시나리오', icon: <FileText size={18} /> },
              { id: 2, label: '샷 리스트', icon: <RefreshCw size={18} /> },
              { id: 3, label: '스토리보드', icon: <Camera size={18} /> },
              { id: 4, label: '최종 스토리보드', icon: <CheckCircle2 size={18} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => (tab.id === 1 || shotList.length > 0) && setCurrentStep(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all font-semibold text-sm ${
                  currentStep === tab.id 
                    ? 'border-violet-500 text-violet-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                } ${tab.id !== 1 && shotList.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                  currentStep === tab.id ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  {tab.id}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-6">
        <AnimatePresence mode="wait">
          {/* --- Step 1: Scenario --- */}
          {currentStep === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">프로젝트 제목</label>
                    <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="예: HOTEL POPO" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all" />
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">시나리오</label>
                      <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setScenarioMode('text')} className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${scenarioMode === 'text' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-500 hover:text-slate-300'}`}>Text</button>
                        <button onClick={() => setScenarioMode('visual')} className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${scenarioMode === 'visual' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-500 hover:text-slate-300'}`}>Visual</button>
                      </div>
                    </div>

                    {scenarioMode === 'visual' && (
                      <div className="space-y-3 pb-2 outline-none" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); const files = Array.from(e.dataTransfer.files) as File[]; const imageFiles = files.filter(f => f.type.startsWith('image/')); if (imageFiles.length > 0) { const newImages: string[] = []; for (const file of imageFiles) { const reader = new FileReader(); const base64 = await new Promise<string>((resolve) => { reader.onload = (ev) => resolve(ev.target?.result as string); reader.readAsDataURL(file); }); const compressed = await compressImage(base64, 800, 0.7); newImages.push(compressed); } setReferenceImages(prev => [...prev, ...newImages]); } }} onPaste={async (e) => { const items = Array.from(e.clipboardData.items) as DataTransferItem[]; const imageItems = items.filter(item => item.type.startsWith('image/')); if (imageItems.length > 0) { const newImages: string[] = []; for (const item of imageItems) { const file = item.getAsFile(); if (file) { const reader = new FileReader(); const base64 = await new Promise<string>((resolve) => { reader.onload = (ev) => resolve(ev.target?.result as string); reader.readAsDataURL(file); }); const compressed = await compressImage(base64, 800, 0.7); newImages.push(compressed); } } setReferenceImages(prev => [...prev, ...newImages]); } }} tabIndex={0}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {referenceImages.map((img, idx) => (
                            <motion.div key={idx} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group shadow-lg">
                              <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <button onClick={() => setReferenceImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500" style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}><X size={12} /></button>
                            </motion.div>
                          ))}
                          <label className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 hover:border-violet-500/50 transition-all group">
                            <input type="file" multiple accept="image/*" className="hidden" onChange={async (e) => { const files = Array.from(e.target.files || []) as File[]; const newImages: string[] = []; for (const file of files) { const reader = new FileReader(); const base64 = await new Promise<string>((resolve) => { reader.onload = (ev) => resolve(ev.target?.result as string); reader.readAsDataURL(file); }); const compressed = await compressImage(base64, 800, 0.7); newImages.push(compressed); } setReferenceImages(prev => [...prev, ...newImages]); }} />
                            <ImageIcon size={20} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
                            <span className="text-[10px] font-bold text-slate-500 group-hover:text-violet-400 uppercase tracking-widest text-center px-2">Add Image<br/>(Drag & Drop or Paste)</span>
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">* 여러 장의 이미지를 업로드하면 AI가 전체적인 색감과 구도를 통합 분석합니다.</p>
                      </div>
                    )}

                    <textarea value={scenarioText} onChange={(e) => setScenarioText(e.target.value)} placeholder={scenarioMode === 'visual' ? "이미지에 대한 설명이나 시나리오의 흐름을 입력하세요..." : "시나리오를 여기에 입력하세요..."} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-base leading-relaxed min-h-[400px] focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none" />
                    <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors text-sm font-semibold">
                          <FileText size={16} /> TXT 업로드
                        </button>
                        <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={uploadTxt} />
                      </div>
                      {projectList.length > 0 && (
                        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
                          {projectList.slice(0, 3).map(p => (
                            <div key={p.id} className="relative group min-w-[200px] bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-all cursor-pointer" onClick={() => loadFromSupabase(p.id)}>
                              <button onClick={(e) => deleteFromSupabase(p.id, e)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X size={12} /></button>
                              <div className="text-sm truncate pr-6 mb-1">
                                <span className="font-bold text-slate-200">{p.title || 'Untitled'}</span>
                                <span className="text-[10px] text-slate-500 font-normal"> ({formatDate(p.updated_at)})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">화면 비율</label>
                    <div className="grid grid-cols-2 gap-2">
                      {RATIOS.map((ratio) => (
                        <button key={ratio.value} onClick={() => setAspectRatio(ratio.value)} className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all font-bold text-sm ${aspectRatio === ratio.value ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}>
                          {ratio.icon}{ratio.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-violet-600/20 to-pink-600/20 border border-violet-500/30 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Clapperboard size={20} className="text-violet-400" />AI 분석 시작</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">입력하신 시나리오를 AI가 분석하여 전문적인 샷 리스트를 생성합니다.</p>
                    <button onClick={handleGenerateShotList} disabled={isGenerating} className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-bold text-lg shadow-xl shadow-violet-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3">
                      {isGenerating ? <><Loader2 className="animate-spin" size={24} />AI 분석 중...</> : <>🎬 샷 리스트 생성<ChevronRight size={20} /></>}
                    </button>
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-500 shrink-0" size={20} />
                      <p className="text-sm text-red-400 font-medium">{error}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Step 2: Shot List --- */}
          {currentStep === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 w-full min-h-[400px]">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-black text-white">샷 리스트 검토</h2>
                  <p className="text-slate-500 text-sm font-medium">{projectTitle || 'Untitled'} · {shotList.length}개의 샷이 생성되었습니다.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={addShot} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold text-slate-300"><Plus size={18} /> 샷 추가</button>
                  <button onClick={() => { const sorted = [...shotList].sort((a, b) => a.scene !== b.scene ? a.scene - b.scene : a.shot - b.shot); setShotList(sorted); showToast('씬/샷 순서로 정렬되었습니다.'); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold text-slate-300"><Hash size={18} /> 정렬</button>
                  <button onClick={handleGenerateShotList} disabled={isGenerating} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold text-slate-300 disabled:opacity-50"><RefreshCw size={18} className={isGenerating ? 'animate-spin' : ''} /> 재생성</button>
                  <button onClick={handleCreateStoryboard} disabled={isGenerating} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-bold text-sm shadow-lg shadow-violet-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"><Camera size={18} /> 스토리보드 생성</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400"><Timer size={20} /></div>
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">⏱ 총 길이 (초)</p><p className="text-lg font-black text-white">{totalSeconds}s</p></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400"><Clock size={20} /></div>
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">📽 분:초</p><p className="text-lg font-black text-white">{formatTime(totalSeconds)}</p></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-400"><Hash size={20} /></div>
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🎞 총 샷 수</p><p className="text-lg font-black text-white">{shotList.length} <span className="text-slate-500 text-sm font-medium">Shots</span></p></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400"><Clapperboard size={20} /></div>
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🎬 총 프레임 수</p><p className="text-lg font-black text-white">{totalSeconds * 24} <span className="text-slate-500 text-sm font-medium">f</span></p></div>
                </div>
              </div>

              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-violet-400 uppercase tracking-widest">
                    <span>AI가 스토리보드 프롬프트를 작성 중입니다...</span>
                    <span>{generationProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-violet-600 to-pink-600" initial={{ width: 0 }} animate={{ width: `${generationProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[1000px] text-left border-collapse">
                    <thead>
                      <tr className="bg-violet-500/10">
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">씬/샷</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">제목 & 설명</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">길이</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">샷 크기</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">앵글</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">렌즈</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[140px]">레퍼런스</th>
                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {shotList.map((shot, idx) => (
                        <tr key={shot.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center justify-center w-10 h-8 rounded-lg bg-violet-500/20 text-violet-400 font-black text-xs">{shot.scene}</span>
                              <span className="flex items-center justify-center w-10 h-8 rounded-lg bg-pink-500/20 text-pink-400 font-black text-xs">{shot.shot}</span>
                            </div>
                          </td>
                          <td className="p-4 align-top min-w-[300px]">
                            <div className="space-y-2">
                              <input type="text" value={shot.title} onChange={(e) => updateShot(idx, 'title', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
                              <textarea value={shot.description} onChange={(e) => updateShot(idx, 'description', e.target.value)} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 leading-relaxed focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none" />
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="space-y-2 min-w-[100px]">
                              <div className="relative">
                                <input type="number" min="1" value={parseDuration(shot.duration)} onChange={(e) => updateShot(idx, 'duration', `${e.target.value} seconds`)} className="w-full bg-white/5 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">s</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {[2, 3, 5, 7, 10].map(val => (
                                  <button key={val} onClick={() => updateShot(idx, 'duration', `${val} seconds`)} className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${parseDuration(shot.duration) === val ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'}`}>{val}s</button>
                                ))}
                              </div>
                              <div className="text-[11px] font-medium text-slate-500">{parseDuration(shot.duration)}초 · {parseDuration(shot.duration) * 24}f</div>
                            </div>
                          </td>
                          <td className="p-4 align-top"><input list="shot-sizes" value={shot.shotSize} onChange={(e) => updateShot(idx, 'shotSize', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50" /></td>
                          <td className="p-4 align-top"><input list="camera-angles" value={shot.cameraAngle} onChange={(e) => updateShot(idx, 'cameraAngle', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50" /></td>
                          <td className="p-4 align-top"><input list="lenses" value={shot.lens} onChange={(e) => updateShot(idx, 'lens', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50" /></td>
                          <td className="p-4 align-top">
                            <div className="relative group/ref" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (ev) => updateShot(idx, 'referenceImage', ev.target?.result as string); reader.readAsDataURL(file); } }} onPaste={(e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const blob = items[i].getAsFile(); if (blob) { const reader = new FileReader(); reader.onload = (ev) => updateShot(idx, 'referenceImage', ev.target?.result as string); reader.readAsDataURL(blob); } } } }} tabIndex={0}>
                              {shot.referenceImage ? (
                                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-white/5">
                                  <img src={shot.referenceImage} alt="Reference" className="w-full h-20 object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setSelectedImage(shot.referenceImage!)} referrerPolicy="no-referrer" />
                                  <button onClick={(e) => { e.stopPropagation(); updateShot(idx, 'referenceImage', undefined); }} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors"><X size={10} /></button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center gap-1 border border-dashed border-violet-500/30 rounded-lg p-2 bg-violet-500/5 cursor-pointer hover:bg-violet-500/10 transition-all">
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => updateShot(idx, 'referenceImage', ev.target?.result as string); reader.readAsDataURL(file); } }} />
                                  <ImageIcon size={14} className="text-violet-400/50" />
                                  <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-tighter">🖼 레퍼런스</span>
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleGenerateSinglePrompt(shot)} disabled={isGenerating} className="p-2 rounded-lg hover:bg-violet-500/10 text-slate-400 hover:text-violet-400 transition-colors disabled:opacity-50" title="프롬프트 생성/재생성"><RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} /></button>
                              <button onClick={() => duplicateShot(idx)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="복제"><Copy size={16} /></button>
                              <button onClick={() => deleteShot(idx)} className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors" title="삭제"><Trash2 size={16} /></button>
                              <div className="flex flex-col border-l border-white/10 pl-1">
                                <button onClick={() => moveShot(idx, 'up')} disabled={idx === 0} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors disabled:opacity-20"><ChevronUp size={14} /></button>
                                <button onClick={() => moveShot(idx, 'down')} disabled={idx === shotList.length - 1} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors disabled:opacity-20"><ChevronDown size={14} /></button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Step 3: Storyboard --- */}
          {currentStep === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-black text-white">스토리보드</h2>
                  <p className="text-slate-500 text-sm font-medium">{projectTitle || 'Untitled'} · {shotList.length}개의 샷 프롬프트</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCurrentStep(2)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold text-slate-300">← 샷 리스트로</button>
                  <button onClick={handleCreateStoryboard} disabled={isGenerating} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-bold text-sm shadow-lg shadow-violet-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"><RefreshCw size={18} className={isGenerating ? 'animate-spin' : ''} /> 전체 재생성</button>
                </div>
              </div>

              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-violet-400 uppercase tracking-widest">
                    <span>AI가 스토리보드 프롬프트를 작성 중입니다...</span>
                    <span>{generationProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-violet-600 to-pink-600" initial={{ width: 0 }} animate={{ width: `${generationProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shotList.map((shot, idx) => {
                  const key = `${shot.scene}-${shot.shot}`;
                  const promptData = storyboardPrompts[key];
                  const ratioValue = aspectRatio.split(':');
                  const ratioNum = Number(ratioValue[0]) / Number(ratioValue[1]);
                  return (
                    <motion.div key={shot.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden group hover:border-violet-500/30 transition-all hover:shadow-2xl hover:shadow-violet-500/10">
                      <div className="relative bg-black flex items-center justify-center overflow-hidden" style={{ aspectRatio: `${ratioNum}` }}>
                        <div className="absolute inset-0 bg-gradient-to-br from-[#0f0c1a] to-[#1a1035] flex flex-col items-center justify-center gap-3">
                          <Camera size={40} className="text-slate-700 group-hover:text-violet-500/50 transition-colors" />
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{promptData ? '프롬프트 생성 완료' : '생성 중...'}</span>
                        </div>
                        {promptData && (
                          <button onClick={() => { navigator.clipboard.writeText(promptData.prompt); showToast('프롬프트가 복사되었습니다!'); }} className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-violet-600/90 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg">📋 프롬프트 복사</button>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scene {shot.scene} · Shot {shot.shot}</span>
                          <button onClick={() => handleGenerateSinglePrompt(shot)} disabled={isGenerating} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-all disabled:opacity-50"><RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} /></button>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white mb-1">{shot.title}</h3>
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{shot.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[shot.shotSize, shot.cameraAngle, shot.lens, shot.duration].map((tag, i) => (
                            <span key={i} className="px-2 py-1 rounded-md bg-white/5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">{tag}</span>
                          ))}
                        </div>
                        {promptData && (
                          <details>
                            <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors"><CheckCircle2 size={12} />AI 이미지 프롬프트</summary>
                            <div className="mt-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
                              <p className="text-[11px] text-slate-400 leading-relaxed italic">"{promptData.prompt}"</p>
                              {promptData.negativePrompt && <p className="text-[10px] text-red-400/70 leading-relaxed"><span className="font-bold text-red-400 uppercase">Negative:</span> {promptData.negativePrompt}</p>}
                              <button onClick={() => { navigator.clipboard.writeText(promptData.prompt); showToast('프롬프트가 복사되었습니다!'); }} className="w-full py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] font-bold text-violet-400 hover:bg-violet-500/20 transition-all">프롬프트 복사</button>
                            </div>
                          </details>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* --- Step 4: Final Storyboard --- */}
          {currentStep === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-black text-white">최종 스토리보드</h2>
                  <p className="text-slate-500 text-sm font-medium">{projectTitle || 'Untitled'} · 최종 이미지를 업로드하여 완성하세요.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCurrentStep(3)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold text-slate-300">← 스토리보드로</button>
                  <button onClick={exportToPDF} disabled={isExporting} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all ${isExporting ? 'opacity-70 cursor-wait' : ''}`}>
                    {isExporting ? <><Loader2 size={18} className="animate-spin" />⏳ PDF 생성 중...</> : <><Upload size={18} /> 전체 내보내기</>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shotList.map((shot, idx) => {
                  const key = `${shot.scene}-${shot.shot}`;
                  const promptData = storyboardPrompts[key];
                  const finalImage = finalImages[key];
                  const ratioValue = aspectRatio.split(':');
                  const ratioNum = Number(ratioValue[0]) / Number(ratioValue[1]);
                  const handleFile = (file: File) => {
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setFinalImages(prev => ({ ...prev, [key]: ev.target?.result as string }));
                      reader.readAsDataURL(file);
                    }
                  };
                  return (
                    <motion.div key={shot.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden group hover:border-emerald-500/30 transition-all hover:shadow-2xl hover:shadow-emerald-500/10">
                      <div className="relative bg-black flex items-center justify-center overflow-hidden cursor-pointer" style={{ aspectRatio: `${ratioNum}` }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }} onPaste={(e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const blob = items[i].getAsFile(); if (blob) handleFile(blob); } } }} tabIndex={0}>
                        {finalImage ? (
                          <div className="relative w-full h-full">
                            <img src={finalImage} alt="Final" className="w-full h-full object-cover" onClick={() => setSelectedImage(finalImage)} referrerPolicy="no-referrer" />
                            <button onClick={(e) => { e.stopPropagation(); setFinalImages(prev => { const next = { ...prev }; delete next[key]; return next; }); }} className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors z-10"><X size={16} /></button>
                          </div>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0f0c1a] to-[#1a1035] cursor-pointer hover:bg-white/5 transition-colors border-2 border-dashed border-white/10 m-2 rounded-xl">
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
                            <ImageIcon size={40} className="text-slate-700 group-hover:text-emerald-500/50 transition-colors" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">🖼 최종 이미지 추가</span>
                          </label>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scene {shot.scene} · Shot {shot.shot}</span>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white mb-1">{shot.title}</h3>
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{shot.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[shot.shotSize, shot.cameraAngle, shot.lens, shot.duration].map((tag, i) => (
                            <span key={i} className="px-2 py-1 rounded-md bg-white/5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">{tag}</span>
                          ))}
                        </div>
                        {promptData && (
                          <details>
                            <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors"><CheckCircle2 size={12} />AI 이미지 프롬프트</summary>
                            <div className="mt-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
                              <p className="text-[11px] text-slate-400 leading-relaxed italic">"{promptData.prompt}"</p>
                              {promptData.negativePrompt && <p className="text-[10px] text-red-400/70 leading-relaxed"><span className="font-bold text-red-400 uppercase">Negative:</span> {promptData.negativePrompt}</p>}
                            </div>
                          </details>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-[1400px] mx-auto p-6 border-t border-white/5 text-center">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-widest">AI Storyboard Generator · Powered by Gemini 3.1 Flash</p>
      </footer>

      {/* --- Cloud List Modal --- */}
      <AnimatePresence>
        {showCloudListModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCloudListModal(false)} className="absolute inset-0 bg-black/80" style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-2xl bg-[#1a1625] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center"><Activity className="text-emerald-400" size={20} /></div>
                  <div>
                    <h2 className="text-xl font-bold text-white">클라우드 프로젝트 목록</h2>
                    <p className="text-xs text-slate-500">최근 저장된 20개의 프로젝트를 표시합니다.</p>
                  </div>
                </div>
                <button onClick={() => setShowCloudListModal(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {projectList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4"><FolderOpen size={48} className="opacity-20" /><p>저장된 프로젝트가 없습니다.</p></div>
                ) : (
                  <div className="grid gap-3">
                    {projectList.map(p => (
                      <div key={p.id} onClick={() => loadFromSupabase(p.id)} className="group flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-violet-500/30 transition-all cursor-pointer">
                        <div className="flex flex-col gap-1">
                          <div className="text-slate-200 group-hover:text-violet-400 transition-colors">
                            <span className="font-bold">{p.title || 'Untitled'}</span>
                            <span className="text-xs text-slate-500 font-normal"> ({formatDate(p.updated_at)})</span>
                          </div>
                          <span className="text-[10px] text-slate-600 flex items-center gap-1"><Clock size={10} />최종 수정: {new Date(p.updated_at).toLocaleString()}</span>
                        </div>
                        <button onClick={(e) => deleteFromSupabase(p.id, e)} className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <datalist id="shot-sizes">{SHOT_SIZES.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="camera-angles">{CAMERA_ANGLES.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="lenses">{LENSES.map(v => <option key={v} value={v} />)}</datalist>

      <AnimatePresence>
        {showConfirm && (
          <div key="confirm-modal-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1a1625] border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">확인</h3>
              <p className="text-slate-400 mb-6">{showConfirm.message}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowConfirm(null)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium">취소</button>
                <button onClick={showConfirm.onConfirm} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors text-sm font-medium">확인</button>
              </div>
            </motion.div>
          </div>
        )}

        {toast && (
          <motion.div key="toast-notification" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl shadow-2xl">
            {toast.type === 'success' ? <CheckCircle2 className="text-emerald-400" size={18} /> : <AlertCircle className="text-red-400" size={18} />}
            <span className="text-sm font-medium text-white">{toast.message}</span>
          </motion.div>
        )}

        {selectedImage && (
          <motion.div key="image-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedImage(null)} className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-8 cursor-zoom-out" style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative max-w-5xl w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <img src={selectedImage} alt="Reference Full" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl border border-white/10 object-contain" referrerPolicy="no-referrer" />
              <button onClick={() => setSelectedImage(null)} className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"><X size={24} /></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
