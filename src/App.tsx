import React, { useEffect, useState } from 'react';
import { GeneratedCode } from './types';
import { Search, Trash2, Printer, QrCode, FolderClock, LayoutGrid, Settings, DownloadCloud, Plus, FileDown, FileUp, Pencil, Copy, Eye, LogOut, LogIn } from 'lucide-react';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { format } from 'date-fns';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { QrImage, BarcodeImage } from './components/GeneratedImages';
import { generateQrDataUrl, generateBarcodeDataUrl } from './lib/generators';
import { getCodes, saveCode, updateCode, deleteCode } from './lib/db';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [codes, setCodes] = useState<GeneratedCode[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCode, setSelectedCode] = useState<GeneratedCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<string | null>(null);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [pdfModalOpen, setPdfModalOpen] = useState<'single' | 'batch' | 'settings' | false>(false);
  const defaultConfig = {
    width: 60, // mm
    height: 80, // mm
    marginTop: 10, // mm
    itemSpacing: 5, // mm
    showTitle: true,
    showId: true,
    qrSize: 35, // mm
    qrYOffset: 0,
    qrPadding: 0, // mm
    qrBorderWidth: 0, // mm
    qrBorderColor: '#000000',
    barcodeWidth: 50, // mm
    barcodeHeight: 12, // mm
    titleAlign: 'center' as 'left' | 'center' | 'right',
    titleYOffset: 0,
    idAlign: 'center' as 'left' | 'center' | 'right',
    idYOffset: 0,
  };

  const getInitialPdfConfig = () => {
    try {
      const stored = localStorage.getItem('pdfConfig');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultConfig, ...parsed }; // Merge to preserve new default fields
      }
    } catch {
      //
    }
    return defaultConfig;
  };

  const [pdfConfig, setPdfConfig] = useState(getInitialPdfConfig);

  const savePdfConfigAsDefault = () => {
    localStorage.setItem('pdfConfig', JSON.stringify(pdfConfig));
    toast.success('Configuração salva como padrão!');
  };
  
  const [formData, setFormData] = useState({
    title: '',
    qr_content: '',
    barcode_content: '',
    qr_size: 400,
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCodes = async (term = '') => {
    if (!user) {
       setCodes([]);
       return;
    }
    try {
      let data = await getCodes(user.uid);
      if (term) {
        data = data.filter(c => c.title.toLowerCase().includes(term.toLowerCase()));
      }
      setCodes(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthChecking(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user) fetchCodes(searchTerm);
  }, [user, searchTerm]);

  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
      toast.error('Erro ao fazer login');
    }
  };

  const logout = () => signOut(auth);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Faça login primeiro.');
      return;
    }
    setIsGenerating(true);
    const toastId = toast.loading(editingId ? 'Atualizando código...' : 'Gerando códigos... Por favor aguarde.');
    try {
      
      const newCode: GeneratedCode = {
        id: editingId || uuidv4(),
        title: formData.title,
        qr_content: formData.qr_content,
        barcode_content: formData.barcode_content || undefined,
        barcode_type: 'code128',
        qr_size: 400,
        userId: user.uid,
        createdAt: editingId ? (codes.find(c => c.id === editingId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now()
      };

      if (editingId) {
        await updateCode(newCode);
      } else {
        await saveCode(newCode);
      }
      
      setFormData({ title: '', qr_content: '', barcode_content: '', qr_size: 400 });
      setEditingId(null);
      await fetchCodes(searchTerm);
      setSelectedCode(newCode);
      toast.success(editingId ? 'Código atualizado com sucesso!' : 'Códigos gerados com sucesso!', { id: toastId });
    } catch (err) {
      console.error('Generate error:', err);
      toast.error('Erro de conexão ao servidor.', { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (code: GeneratedCode, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData({
      title: code.title,
      qr_content: code.qr_content,
      barcode_content: code.barcode_content || '',
      qr_size: 400
    });
    setEditingId(code.id);
    document.getElementById('title-input')?.focus();
  };

  const handleDuplicate = (code: GeneratedCode, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData({
      title: `${code.title} (Cópia)`,
      qr_content: code.qr_content,
      barcode_content: code.barcode_content || '',
      qr_size: 400
    });
    setEditingId(null);
    document.getElementById('title-input')?.focus();
  };

  const handleView = (code: GeneratedCode, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCode(code);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCodeToDelete(id);
  };

  const confirmDelete = async () => {
    if (!codeToDelete) return;
    const toastId = toast.loading('Excluindo código...');
    try {
      await deleteCode(codeToDelete);
      fetchCodes(searchTerm);
      if (selectedCode?.id === codeToDelete) setSelectedCode(null);
      toast.success('Código excluído com sucesso!', { id: toastId });
    } catch (err) {
      console.error('Delete error', err);
      toast.error('Erro ao excluir o código.', { id: toastId });
    } finally {
      setCodeToDelete(null);
    }
  };

  const downloadImageFromDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download concluído!');
  };

  const exportCSV = () => {
    const codesToExport = selectedForBatch.size > 0 ? codes.filter(c => selectedForBatch.has(c.id)) : codes;
    if (codesToExport.length === 0) {
      toast.error('Nenhum código para exportar.');
      return;
    }

    let csvContent = "ID,Título,Conteúdo QR,Conteúdo Código Barras,Data Criação\n";
    codesToExport.forEach(code => {
      const row = [
        code.id,
        code.title,
        code.qr_content,
        code.barcode_content || '',
        new Date(code.createdAt).toISOString()
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codigos_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const importCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) {
        toast.error('Arquivo CSV vazio ou sem dados válidos.');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      const titleIndex = headers.findIndex(h => h.includes('title') || h.includes('título'));
      const qrIndex = headers.findIndex(h => h.includes('qr') || h.includes('conteúdo qr'));
      const barcodeIndex = headers.findIndex(h => h.includes('barcode') || h.includes('código barras') || h.includes('conteúdo código barras'));

      if (titleIndex === -1 || qrIndex === -1) {
        toast.error('O CSV precisa ter colunas para Título e Conteúdo QR.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const toastId = toast.loading('Importando códigos...');
      let successCount = 0;

      const parseCSVLine = (line: string) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"' && line[i+1] === '"') {
            current += '"';
            i++;
          } else if (line[i] === '"') {
            inQuotes = !inQuotes;
          } else if (line[i] === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += line[i];
          }
        }
        result.push(current);
        return result;
      };

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length === 0) continue;

        const title = row[titleIndex];
        const qrContent = row[qrIndex];
        const barcodeContent = barcodeIndex !== -1 ? row[barcodeIndex] : '';

        if (!title || !qrContent) continue;

        try {
          if (user) {
            const newCode: GeneratedCode = {
              id: uuidv4(),
              title,
              qr_content: qrContent,
              barcode_content: barcodeContent || undefined,
              barcode_type: 'code128',
              qr_size: 400,
              userId: user.uid,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await saveCode(newCode);
            successCount++;
          }
        } catch (err) {
          console.error('Failed to import row', i, err);
        }
      }

      toast.success(`${successCount} códigos importados com sucesso!`, { id: toastId });
      fetchCodes(searchTerm);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const generateZIP = async () => {
    if (selectedForBatch.size === 0) return;
    const codesToExport = codes.filter(c => selectedForBatch.has(c.id));
    if (codesToExport.length === 0) return;

    const toastId = toast.loading(`Gerando ZIP (${codesToExport.length} itens)...`);
    const zip = new JSZip();

    try {
      for (const code of codesToExport) {
        const folder = zip.folder(code.id) || zip;
        
        // QR Generated
        const qrBase64Data = await generateQrDataUrl(code.qr_content, 500);
        const qrBase64 = qrBase64Data.split(',')[1];
        folder.file(`${code.id}_qr.png`, qrBase64, { base64: true });
        
        // Barcode Generated
        if (code.barcode_content) {
            const bcBase64Data = await generateBarcodeDataUrl(code.barcode_content);
            if (bcBase64Data) {
                const bcBase64 = bcBase64Data.split(',')[1];
                folder.file(`${code.id}_barcode.png`, bcBase64, { base64: true });
            }
        }
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codigos_lote_${format(new Date(), 'yyyyMMdd_HHmmss')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('ZIP baixado com sucesso!', { id: toastId });
      setSelectedForBatch(new Set()); // Clear selection after export
    } catch (err) {
      console.error('ZIP generation error:', err);
      toast.error('Erro ao gerar o arquivo ZIP', { id: toastId });
    }
  };

  const generatePDF = async () => {
    const codesToPrint = pdfModalOpen === 'batch' 
      ? codes.filter(c => selectedForBatch.has(c.id)) 
      : (selectedCode ? [selectedCode] : []);
      
    if (codesToPrint.length === 0) return;
    
    const toastId = toast.loading(`Gerando PDF (${codesToPrint.length} itens)...`);

    const doc = new jsPDF({
      orientation: pdfConfig.width > pdfConfig.height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfConfig.width, pdfConfig.height]
    });
    
    for (let i = 0; i < codesToPrint.length; i++) {
      const code = codesToPrint[i];
      if (i > 0) doc.addPage();
      
      let currentY = pdfConfig.marginTop || 10;
      
      if (pdfConfig.showTitle) {
        doc.setFontSize(14);
        currentY += (pdfConfig.titleYOffset || 0);
        let titleX = pdfConfig.width / 2;
        if (pdfConfig.titleAlign === 'left') titleX = 5;
        if (pdfConfig.titleAlign === 'right') titleX = pdfConfig.width - 5;
        doc.text(code.title, titleX, currentY, { align: pdfConfig.titleAlign || 'center' });
        currentY += 8;
      }

      if (pdfConfig.showId) {
        doc.setFontSize(10);
        currentY += (pdfConfig.idYOffset || 0);
        let idX = pdfConfig.width / 2;
        if (pdfConfig.idAlign === 'left') idX = 5;
        if (pdfConfig.idAlign === 'right') idX = pdfConfig.width - 5;
        doc.text(`ID: ${code.id}`, idX, currentY, { align: pdfConfig.idAlign || 'center' });
        currentY += 8;
      } else {
        currentY += 2;
      }

      const qrOffset = pdfConfig.qrYOffset || 0;
      const qrPadding = pdfConfig.qrPadding || 0;
      const actualQrSize = Math.max(1, pdfConfig.qrSize - 2 * qrPadding);
      const qrYWithOffset = currentY + qrOffset;

      try {
        const qrDataUrl = await generateQrDataUrl(code.qr_content, 500);
        const qrImg = await loadImage(qrDataUrl);
        
        if (pdfConfig.qrBorderWidth && pdfConfig.qrBorderWidth > 0) {
           doc.setDrawColor(pdfConfig.qrBorderColor || '#000000');
           doc.setLineWidth(pdfConfig.qrBorderWidth);
           doc.rect((pdfConfig.width - pdfConfig.qrSize) / 2, qrYWithOffset, pdfConfig.qrSize, pdfConfig.qrSize);
        }

        const qrX = (pdfConfig.width - pdfConfig.qrSize) / 2 + qrPadding;
        doc.addImage(qrImg, 'PNG', qrX, qrYWithOffset + qrPadding, actualQrSize, actualQrSize);
        // Add offset to currentY if barcode should move down too
        currentY += pdfConfig.qrSize + qrOffset + (pdfConfig.itemSpacing ?? 5);
        
        if (code.barcode_content) {
          try {
            const bcDataUrl = await generateBarcodeDataUrl(code.barcode_content);
            const bcImg = await loadImage(bcDataUrl);
            const bcX = (pdfConfig.width - pdfConfig.barcodeWidth) / 2;
            doc.addImage(bcImg, 'PNG', bcX, currentY, pdfConfig.barcodeWidth, pdfConfig.barcodeHeight);
          } catch (e) {
            console.error('Barcode load error', e);
          }
        }
      } catch (err) {
        console.error('QR load error for code', code.id, err);
        toast.error(`Erro ao carregar imagem para ${code.id}`, { id: toastId });
      }
    }
    
    doc.save(codesToPrint.length === 1 ? `etiqueta_${codesToPrint[0].id}.pdf` : `etiquetas_lote_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    setPdfModalOpen(false);
    if (pdfModalOpen === 'batch') {
      setSelectedForBatch(new Set()); // clear after batch
    }
    toast.success('PDF gerado com sucesso!', { id: toastId });
  };

  const renderPdfPreview = () => {
    let previewCode = pdfModalOpen === 'batch' 
      ? codes.find(c => selectedForBatch.has(c.id)) 
      : selectedCode;
      
    if (!previewCode && pdfModalOpen === 'settings') {
      previewCode = codes[0] || {
        id: 'EXEMPLO12',
        title: 'Exemplo de Título',
        qr_content: 'exemplo',
        barcode_content: 'EXEMPLO12',
        barcode_type: 'code128'
      } as any;
    }
      
    if (!previewCode) return null;
    
    const mmToPx = (mm: number) => mm * 3; // 1mm = 3px approx for preview rendering

    let currentY = pdfConfig.marginTop || 10;
    const titleY = currentY + (pdfConfig.titleYOffset || 0);
    if (pdfConfig.showTitle) currentY += (pdfConfig.titleYOffset || 0) + 8;

    const idY = currentY + (pdfConfig.idYOffset || 0);
    if (pdfConfig.showId) currentY += (pdfConfig.idYOffset || 0) + 8;
    else currentY += 2;

    const qrOffset = pdfConfig.qrYOffset || 0;
    const qrY = currentY + qrOffset;
    currentY += pdfConfig.qrSize + qrOffset + (pdfConfig.itemSpacing ?? 5);
    const barcodeY = currentY;

    return (
       <div 
          className="bg-white shadow-[0_0_15px_rgba(0,0,0,0.1)] relative overflow-hidden" 
          style={{ width: `${mmToPx(pdfConfig.width)}px`, height: `${mmToPx(pdfConfig.height)}px` }}
        >
           {pdfConfig.showTitle && (
              <div className="absolute w-full leading-none whitespace-nowrap overflow-hidden text-ellipsis" 
                   style={{ 
                     top: `${mmToPx(titleY - 4.5)}px`, 
                     fontSize: `${mmToPx(4.5)}px`, 
                     fontWeight: 'bold',
                     textAlign: pdfConfig.titleAlign || 'center',
                     paddingLeft: pdfConfig.titleAlign === 'left' ? `${mmToPx(5)}px` : undefined,
                     paddingRight: pdfConfig.titleAlign === 'right' ? `${mmToPx(5)}px` : undefined,
                     color: '#1e293b'
                   }}>
                {previewCode.title}
              </div>
           )}
           {pdfConfig.showId && (
              <div className="absolute w-full leading-none" 
                   style={{ 
                     top: `${mmToPx(idY - 3)}px`, 
                     fontSize: `${mmToPx(3.5)}px`,
                     textAlign: pdfConfig.idAlign || 'center',
                     paddingLeft: pdfConfig.idAlign === 'left' ? `${mmToPx(5)}px` : undefined,
                     paddingRight: pdfConfig.idAlign === 'right' ? `${mmToPx(5)}px` : undefined,
                     color: '#64748b'
                   }}>
                ID: {previewCode.id}
              </div>
           )}
           
           <div className="absolute bg-white flex justify-center items-center" style={{ 
               top: `${mmToPx(qrY)}px`, 
               left: `${mmToPx((pdfConfig.width - pdfConfig.qrSize) / 2)}px`, 
               width: `${mmToPx(pdfConfig.qrSize)}px`, 
               height: `${mmToPx(pdfConfig.qrSize)}px`, 
               padding: `${mmToPx(pdfConfig.qrPadding || 0)}px`,
               borderWidth: `${mmToPx(pdfConfig.qrBorderWidth || 0)}px`,
               borderColor: pdfConfig.qrBorderColor || '#000000',
               borderStyle: pdfConfig.qrBorderWidth && pdfConfig.qrBorderWidth > 0 ? 'solid' : 'none'
            }}>
              <QrImage content={previewCode.qr_content} size={500} className="w-full h-full object-contain mix-blend-multiply" alt="QR" />
           </div>

           {previewCode.barcode_content && (
              <div className="absolute flex justify-center bg-white" style={{ top: `${mmToPx(barcodeY)}px`, left: `${mmToPx((pdfConfig.width - pdfConfig.barcodeWidth) / 2)}px`, width: `${mmToPx(pdfConfig.barcodeWidth)}px`, height: `${mmToPx(pdfConfig.barcodeHeight)}px` }}>
                 <BarcodeImage content={previewCode.barcode_content} className="w-full h-full object-fill mix-blend-multiply" alt="Barcode" />
              </div>
           )}

           {/* Overflow Warning indicator if items go beyond height */}
           {barcodeY + pdfConfig.barcodeHeight > pdfConfig.height && (
             <div className="absolute bottom-0 left-0 w-full bg-red-500/20 border-t border-red-500 flex items-center justify-center p-1 text-[10px] text-red-600 font-bold backdrop-blur-sm">
                 LIMITE DA PÁGINA ULTRAPASSADO
             </div>
           )}
        </div>
    );
  };

  return (
    <div className="bg-[#F3F4F6] min-h-screen flex font-sans text-slate-800">
      <Toaster richColors position="bottom-right" />
      {/* Delete Confirm Modal */}
      {codeToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Excluir Código</h3>
            <p className="text-slate-600 text-sm mb-6">Deseja realmente excluir este item do histórico? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setCodeToDelete(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PDF Config Modal */}
      {pdfModalOpen && (pdfModalOpen === 'batch' ? selectedForBatch.size > 0 : selectedCode) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="p-6 border-b md:border-b-0 md:border-r border-slate-100 flex-1 overflow-y-auto w-full md:w-1/2">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Configurar Etiqueta PDF</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-600 mb-3 border-b border-slate-100 pb-2">Dimensões da Etiqueta (mm)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Largura</label>
                        <input type="number" value={pdfConfig.width} onChange={(e) => setPdfConfig({...pdfConfig, width: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Altura</label>
                        <input type="number" value={pdfConfig.height} onChange={(e) => setPdfConfig({...pdfConfig, height: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-600 mb-3 border-b border-slate-100 pb-2">Espaçamento (mm)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Margem Superior</label>
                        <input type="number" value={pdfConfig.marginTop ?? 10} onChange={(e) => setPdfConfig({...pdfConfig, marginTop: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Espaço entre Itens</label>
                        <input type="number" value={pdfConfig.itemSpacing ?? 5} onChange={(e) => setPdfConfig({...pdfConfig, itemSpacing: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-600 mb-3 border-b border-slate-100 pb-2">Elementos Básicos</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={pdfConfig.showTitle} onChange={(e) => setPdfConfig({...pdfConfig, showTitle: e.target.checked})} className="rounded text-blue-600 w-4 h-4" />
                        Mostrar Título
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={pdfConfig.showId} onChange={(e) => setPdfConfig({...pdfConfig, showId: e.target.checked})} className="rounded text-blue-600 w-4 h-4" />
                        Mostrar ID
                      </label>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-600 mb-3 border-b border-slate-100 pb-2">Alinhamento e Posição</h4>
                    
                    {pdfConfig.showTitle && (
                      <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <label className="block text-xs font-semibold text-slate-700 mb-2">Ajustes do Título</label>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Alinhamento</label>
                            <select value={pdfConfig.titleAlign} onChange={(e) => setPdfConfig({...pdfConfig, titleAlign: e.target.value as any})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                              <option value="left">Esquerda</option>
                              <option value="center">Centro</option>
                              <option value="right">Direita</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ajuste Vertical (mm)</label>
                            <div className="relative">
                              <input type="number" step="0.5" value={pdfConfig.titleYOffset || 0} onChange={(e) => setPdfConfig({...pdfConfig, titleYOffset: Number(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {pdfConfig.showId && (
                      <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <label className="block text-xs font-semibold text-slate-700 mb-2">Ajustes do ID</label>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Alinhamento</label>
                            <select value={pdfConfig.idAlign} onChange={(e) => setPdfConfig({...pdfConfig, idAlign: e.target.value as any})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                              <option value="left">Esquerda</option>
                              <option value="center">Centro</option>
                              <option value="right">Direita</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ajuste Vertical (mm)</label>
                            <div className="relative">
                              <input type="number" step="0.5" value={pdfConfig.idYOffset || 0} onChange={(e) => setPdfConfig({...pdfConfig, idYOffset: Number(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <label className="block text-xs font-semibold text-slate-700 mb-2">Ajustes do QR Code</label>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ajuste Vertical (mm)</label>
                          <div className="relative">
                            <input type="number" step="0.5" value={pdfConfig.qrYOffset || 0} onChange={(e) => setPdfConfig({...pdfConfig, qrYOffset: Number(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Espaçamento Interno (mm)</label>
                          <div className="relative">
                            <input type="number" step="0.5" value={pdfConfig.qrPadding || 0} onChange={(e) => setPdfConfig({...pdfConfig, qrPadding: Number(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Espessura Moldura (mm)</label>
                          <div className="relative">
                            <input type="number" step="0.5" min="0" value={pdfConfig.qrBorderWidth || 0} onChange={(e) => setPdfConfig({...pdfConfig, qrBorderWidth: Number(e.target.value)})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Cor da Moldura</label>
                          <div className="relative">
                            <input type="color" value={pdfConfig.qrBorderColor || '#000000'} onChange={(e) => setPdfConfig({...pdfConfig, qrBorderColor: e.target.value})} className="w-full h-[38px] bg-white border border-slate-200 rounded-lg p-1 outline-none cursor-pointer focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-600 mb-3 border-b border-slate-100 pb-2">Tamanhos de Imagem (mm)</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1 flex justify-between">Tamanho do QR Code <span className="font-medium text-blue-600">{pdfConfig.qrSize}x{pdfConfig.qrSize}mm</span></label>
                        <input type="range" min="20" max="200" value={pdfConfig.qrSize} onChange={(e) => setPdfConfig({...pdfConfig, qrSize: Number(e.target.value)})} className="w-full accent-blue-600" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Largura do Cód. Barras</label>
                        <input type="number" value={pdfConfig.barcodeWidth} onChange={(e) => setPdfConfig({...pdfConfig, barcodeWidth: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Altura do Cód. Barras</label>
                        <input type="number" value={pdfConfig.barcodeHeight} onChange={(e) => setPdfConfig({...pdfConfig, barcodeHeight: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-0 flex-1 overflow-y-auto bg-[#e5e7eb] flex flex-col items-center py-10 px-4 w-full md:w-1/2 relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] shadow-inner">
                <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur text-white px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm z-10 font-mono">
                  Escala ~ 1mm:3px
                </div>
                {renderPdfPreview()}
                
                <p className="text-xs text-slate-500 mt-6 text-center max-w-[80%] leading-relaxed font-medium bg-white/70 backdrop-blur py-2 px-4 rounded-lg shadow-sm">
                  Esta é uma visualização EXATA em proporção. Se elementos passarem dos limites do cartão, ajuste os espaçamentos ou tamanhos.
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-between items-center shrink-0 gap-4 sm:gap-0">
               <button 
                 onClick={savePdfConfigAsDefault}
                 className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
               >
                 Salvar como Padrão
               </button>
               <div className="flex gap-3 w-full sm:w-auto">
                 <button 
                   onClick={() => setPdfModalOpen(false)}
                   className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm"
                 >
                   Cancelar
                 </button>
                 {pdfModalOpen !== 'settings' && (
                   <button 
                     onClick={generatePDF}
                     className="flex-1 sm:flex-none px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                   >
                     <Printer className="w-4 h-4" />
                     {pdfModalOpen === 'batch' ? `Baixar PDF Lote (${selectedForBatch.size})` : 'Baixar PDF'}
                   </button>
                 )}
               </div>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar Navigation */}
      <nav className="w-20 bg-[#111827] hidden lg:flex flex-col items-center py-8 gap-8 border-r border-slate-200">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg">
          <QrCode className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-6 w-full items-center">
          <div className="p-3 bg-white/10 rounded-xl text-white cursor-pointer transition-colors relative group">
            <LayoutGrid className="w-6 h-6" />
            <span className="absolute left-14 top-2 bg-slate-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Gerar</span>
          </div>
          <div className="p-3 text-slate-500 hover:text-white cursor-pointer transition-colors relative group">
            <FolderClock className="w-6 h-6" />
            <span className="absolute left-14 top-2 bg-slate-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Histórico</span>
          </div>
          <div 
            className="p-3 text-slate-500 hover:text-white cursor-pointer transition-colors relative group"
            onClick={() => setPdfModalOpen('settings')}
          >
            <Settings className="w-6 h-6" />
            <span className="absolute left-14 top-2 bg-slate-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Ajustes</span>
          </div>
        </div>
        <div className="mt-auto flex flex-col items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Sistema Local Online"></div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full w-full min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <h1 className="text-lg font-semibold text-slate-800 whitespace-nowrap">TagForge</h1>
          </div>
          <div className="flex items-center gap-4 md:gap-6 mt-2 sm:mt-0">
            {user ? (
               <div className="flex items-center gap-3">
                 <div className="flex flex-col items-end">
                   <span className="text-xs font-semibold text-slate-800">{user.displayName || user.email}</span>
                   <span className="text-[10px] text-slate-500">Logado</span>
                 </div>
                 <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Sair">
                   <LogOut className="w-4 h-4" />
                 </button>
               </div>
            ) : (
               <button onClick={login} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                 <LogIn className="w-4 h-4" /> Entrar
               </button>
            )}
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar no histórico..." 
                className="w-48 lg:w-64 pl-10 pr-4 py-2 bg-slate-100 border border-transparent rounded-lg text-sm focus:bg-white focus:border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            <button 
              id="new-item-btn"
              onClick={() => document.getElementById('title-input')?.focus()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Código</span>
            </button>
          </div>
        </header>

        {/* Page Layout */}
        <div className="flex-1 p-4 md:p-8 flex flex-col xl:flex-row gap-6 md:gap-8 overflow-hidden h-[calc(100vh-4rem)]">
          
          {/* Left Column: Form & History */}
          <div className="flex-[3] flex flex-col gap-6 overflow-hidden h-full min-w-0">
            
            {/* Generation Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm shrink-0">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-5">{editingId ? 'Editar Código' : 'Criar Novo Código'}</h2>
              <form id="generation-form" onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                   <label htmlFor="title-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Título / Identificador</label>
                   <input 
                     id="title-input"
                     required
                     type="text" 
                     placeholder="Ex: Lote A - Out/2023"
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800"
                     value={formData.title}
                     onChange={e => setFormData({...formData, title: e.target.value})}
                   />
                </div>
                <div className="flex flex-col">
                   <label htmlFor="qr-content-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                     Conteudo do QR Code
                     <span className="text-blue-500 font-normal normal-case">*(Obrigatório)</span>
                   </label>
                   <textarea 
                     id="qr-content-input"
                     required
                     className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800 resize-none min-h-[114px]"
                     placeholder="URLs, textos longos, JSON..."
                     value={formData.qr_content}
                     onChange={e => setFormData({...formData, qr_content: e.target.value})}
                   />
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="barcode-content-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between tracking-tight">
                      Código de Barras
                      <span className="text-slate-400 font-normal normal-case">*(Opcional)</span>
                    </label>
                    <input 
                      id="barcode-content-input"
                      type="text"
                      pattern="^[\x20-\x7E]*$"
                      title="Apenas caracteres ASCII são permitidos (sem acentos ou caracteres especiais)"
                      placeholder="Apenas ASCII (Ex: COD-123)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800 invalid:border-red-500 invalid:focus:ring-red-500"
                      value={formData.barcode_content}
                      onChange={e => {
                        const val = e.target.value;
                        const asciiOnly = val.replace(/[^\x20-\x7E]/g, '');
                        if (val !== asciiOnly) {
                          toast.error('Apenas caracteres sem acentuação (ASCII) são permitidos no Código de Barras.');
                        }
                        setFormData({...formData, barcode_content: asciiOnly});
                      }}
                    />
                  </div>
                </div>
                <div className="md:col-span-2 flex justify-end mt-2 gap-3">
                  {editingId && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingId(null);
                        setFormData({ title: '', qr_content: '', barcode_content: '', qr_size: 400 });
                      }}
                      className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                     id="generate-btn"
                     type="submit" 
                     disabled={isGenerating}
                     className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
                  >
                     {isGenerating ? (editingId ? 'Atualizando...' : 'Gerando Códigos...') : (
                       <>
                         {editingId ? <Pencil className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                         {editingId ? 'Atualizar Código' : 'Gerar Códigos'}
                       </>
                     )}
                  </button>
                </div>
              </form>
            </div>

            {/* History List */}
            <div id="history-panel" className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[250px]">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-slate-800">Histórico de Salvos</h3>
                  {selectedForBatch.size > 0 && (
                    <div className="flex items-center gap-2 ml-4 border-l border-slate-200 pl-4">
                      <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">{selectedForBatch.size} selecionado(s)</span>
                      <button
                        type="button"
                        onClick={() => setPdfModalOpen('batch')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={generateZIP}
                        className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" /> ZIP
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={importCSV} />
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors" title="Importar CSV para gerar novos códigos">
                    <FileUp className="w-4 h-4" /> Importar CSV
                  </button>
                  <button onClick={exportCSV} className="text-xs flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors" title="Exportar histórico atual ou selecionados">
                    <FileDown className="w-4 h-4" /> Exportar CSV
                  </button>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium border-l border-slate-200 pl-3">
                    <FolderClock className="w-4 h-4" />
                    {codes.length} {codes.length === 1 ? 'registro' : 'registros'}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <table id="history-table" className="w-full text-left border-collapse min-w-[500px]">
                  <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>
                      <th className="px-4 py-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          className="rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                          checked={codes.length > 0 && selectedForBatch.size === codes.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedForBatch(new Set(codes.map(c => c.id)));
                            } else {
                              setSelectedForBatch(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Título</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Códigos</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {codes.map(code => (
                      <tr 
                        key={code.id} 
                        className={`cursor-pointer transition-colors ${selectedCode?.id === code.id || selectedForBatch.has(code.id) ? 'bg-blue-50/60 border-l-2 border-l-blue-600' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}
                        onClick={() => setSelectedCode(code)}
                      >
                        <td className="px-4 py-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            className="rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                            checked={selectedForBatch.has(code.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedForBatch);
                              if (e.target.checked) newSet.add(code.id);
                              else newSet.delete(code.id);
                              setSelectedForBatch(newSet);
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 font-mono">
                          {format(new Date((code as any).createdAt || (code as any).created_at || Date.now()), 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-3 font-medium text-sm text-slate-800 max-w-[200px] truncate" title={code.title}>
                          {code.title}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-2">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">QR</span>
                            {code.barcode_content && (
                              <span className="bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Barra</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 flex items-center justify-end gap-1">
                          <button onClick={(e) => handleView(code, e)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50" title="Visualizar">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => handleEdit(code, e)} className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors rounded-md hover:bg-emerald-50" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => handleDuplicate(code, e)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors rounded-md hover:bg-indigo-50" title="Duplicar">
                            <Copy className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => handleDelete(code.id, e)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {codes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center text-slate-400 text-sm">
                          Nenhum código gerado ainda. Preencha o formulário acima!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Preview Panel */}
          <div id="preview-panel" className="flex-[2] flex flex-col gap-6 shrink-0 pb-4 overflow-y-auto">
            {selectedCode ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-6 relative">
                <div className="flex justify-between items-start border-b border-slate-100 pb-4 shrink-0">
                  <div className="w-full">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Visualização do Código</h3>
                    <h2 className="text-xl font-bold text-slate-800 break-all">{selectedCode.title}</h2>
                  </div>
                </div>
                
                {/* QR Preview */}
                <div className="flex flex-col sm:flex-row items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                  <div className="p-2 sm:p-3 bg-white border border-slate-200 rounded-lg shrink-0 shadow-sm relative group w-full sm:w-auto flex justify-center">
                    <QrImage 
                       content={selectedCode.qr_content} 
                       size={500}
                       alt="QR Code" 
                       className="w-32 h-32 sm:w-28 sm:h-28 object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="flex flex-col flex-1 h-full py-1 w-full min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conteúdo (QR)</span>
                    <p className="text-sm font-mono text-slate-700 mt-1 break-all line-clamp-3" title={selectedCode.qr_content}>
                      {selectedCode.qr_content}
                    </p>
                    <div className="mt-auto pt-4 sm:pt-2">
                       <button 
                         onClick={async () => {
                           const dataUrl = await generateQrDataUrl(selectedCode.qr_content, 500);
                           downloadImageFromDataUrl(dataUrl, `QR_${selectedCode.title.replace(/\\s+/g, '_')}.png`);
                         }}
                         className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
                       >
                         <DownloadCloud className="w-3.5 h-3.5" /> Salvar QR (PNG)
                       </button>
                    </div>
                  </div>
                </div>

                {/* Barcode Preview */}
                {selectedCode.barcode_content ? (
                  <div className="flex flex-col sm:flex-row items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                    <div className="flex-1 min-w-0 pr-0 sm:pr-4 flex flex-col h-full py-1 w-full">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conteúdo (Barra)</span>
                      <p className="text-sm font-mono text-slate-700 mt-1 break-all line-clamp-2" title={selectedCode.barcode_content}>
                        {selectedCode.barcode_content}
                      </p>
                      <div className="mt-auto pt-4 sm:pt-2">
                        <button 
                           onClick={async () => {
                             if (!selectedCode.barcode_content) return;
                             const dataUrl = await generateBarcodeDataUrl(selectedCode.barcode_content);
                             downloadImageFromDataUrl(dataUrl, `BARCODE_${selectedCode.title.replace(/\\s+/g, '_')}.png`);
                           }}
                           className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
                        >
                           <DownloadCloud className="w-3.5 h-3.5" /> Salvar Cód. Barras
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-lg shrink-0 shadow-sm w-full sm:w-40 flex items-center justify-center mt-4 sm:mt-0">
                      <BarcodeImage content={selectedCode.barcode_content} alt="Barcode" className="w-full h-12 sm:h-16 object-contain mix-blend-multiply" />
                    </div>
                  </div>
                ) : (
                  <div className="p-6 border border-slate-100 border-dashed rounded-xl bg-slate-50 text-center flex flex-col items-center justify-center min-h-[100px]">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Código de Barras</span>
                     <span className="text-xs text-slate-500">Nenhum gerado para este item.</span>
                  </div>
                )}

                {/* Action Footer */}
                <div className="mt-auto pt-6 border-t border-slate-100 w-full shrink-0">
                  <button 
                    id="generate-pdf-btn"
                    onClick={() => setPdfModalOpen('single')} 
                    className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                  >
                    <Printer className="w-4 h-4" />
                    Configurar e Gerar Etiqueta PDF
                  </button>
                </div>

              </div>
            ) : (
              <div className="bg-white border border-slate-200 border-dashed rounded-xl p-12 text-center h-full flex flex-col items-center justify-center gap-4 text-slate-500">
                 <div className="p-4 bg-slate-50 rounded-full shadow-inner">
                   <QrCode className="w-10 h-10 text-slate-300" />
                 </div>
                 <div>
                   <p className="font-bold text-slate-600 mb-1 text-lg">Nenhum código selecionado</p>
                   <p className="text-sm max-w-xs mx-auto">Preencha o formulário ou clique em um histórico para visualizar os códigos.</p>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
