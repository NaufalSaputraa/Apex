import React, { useRef } from 'react';
import {
  UploadCloud,
  File,
  FileText,
  Image,
  ExternalLink,
  FolderOpen,
  Copy,
  Trash2,
} from 'lucide-react';
import { ShelfFile } from '../types';

interface ShelfViewProps {
  files: ShelfFile[];
  onAddFiles: (newFiles: ShelfFile[]) => void;
  onOpenFile: (path: string) => void;
  onRevealFile: (path: string) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
}

export const ShelfView: React.FC<ShelfViewProps> = ({
  files,
  onAddFiles,
  onOpenFile,
  onRevealFile,
  onRemoveFile,
  onClearFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added: ShelfFile[] = Array.from(e.dataTransfer.files).map((f) => {
        // In webview / browser, f.path or f.name is available
        const anyFile = f as any;
        const filePath = anyFile.path || f.name;
        const ext = f.name.split('.').pop() || '';
        return {
          id: Math.random().toString(36).substring(2, 9),
          name: f.name,
          path: filePath,
          sizeFormatted: formatSize(f.size),
          extension: ext.toLowerCase(),
          addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      });
      onAddFiles(added);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added: ShelfFile[] = Array.from(e.target.files).map((f) => {
        const anyFile = f as any;
        const filePath = anyFile.path || f.name;
        const ext = f.name.split('.').pop() || '';
        return {
          id: Math.random().toString(36).substring(2, 9),
          name: f.name,
          path: filePath,
          sizeFormatted: formatSize(f.size),
          extension: ext.toLowerCase(),
          addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      });
      onAddFiles(added);
    }
  };

  const getFileIcon = (ext: string) => {
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      return <Image size={15} style={{ color: '#38bdf8' }} />;
    }
    if (['txt', 'md', 'pdf', 'docx', 'json'].includes(ext)) {
      return <FileText size={15} style={{ color: '#f59e0b' }} />;
    }
    return <File size={15} style={{ color: '#94a3b8' }} />;
  };

  return (
    <div className="shelf-view">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        style={{ display: 'none' }}
      />

      {/* Drag & Drop Trigger */}
      <div
        className="drop-zone-box"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={20} style={{ color: '#38bdf8' }} />
        <p>Drop files here or click to shelf temporarily</p>
      </div>

      {/* Shelved Files List */}
      {files.length > 0 ? (
        <div className="shelf-list">
          {files.map((file) => (
            <div key={file.id} className="shelf-item">
              <div className="shelf-item-info">
                {getFileIcon(file.extension)}
                <div>
                  <div className="shelf-item-name">
                    {file.name}
                  </div>
                  <div className="shelf-item-meta">
                    {file.sizeFormatted} • {file.addedAt}
                  </div>
                </div>
              </div>

              <div className="shelf-item-actions">
                <button
                  className="shelf-action-btn"
                  data-tooltip="Buka file"
                  data-tooltip-align="right"
                  onClick={() => onOpenFile(file.path)}
                >
                  <ExternalLink size={13} />
                </button>
                <button
                  className="shelf-action-btn"
                  data-tooltip="Tampilkan di Explorer"
                  data-tooltip-align="right"
                  onClick={() => onRevealFile(file.path)}
                >
                  <FolderOpen size={13} />
                </button>
                <button
                  className="shelf-action-btn"
                  data-tooltip="Salin path"
                  data-tooltip-align="right"
                  onClick={() => navigator.clipboard.writeText(file.path)}
                >
                  <Copy size={13} />
                </button>
                <button
                  className="shelf-action-btn"
                  data-tooltip="Hapus dari shelf"
                  data-tooltip-align="right"
                  onClick={() => onRemoveFile(file.id)}
                >
                  <Trash2 size={13} style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', fontSize: '11.5px', color: 'rgba(255,255,255,0.3)', padding: '6px' }}>
          Shelf is empty. Drag files in from any folder or desktop!
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClearFiles}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Clear all ({files.length})
          </button>
        </div>
      )}
    </div>
  );
};
