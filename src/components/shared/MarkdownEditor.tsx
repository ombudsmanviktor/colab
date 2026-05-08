import { useState, useRef, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold, Italic, Strikethrough, Link2, Image, Code, List, ListOrdered,
  Heading1, Heading2, Heading3, Quote, Minus, Eye, Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  className?: string
  onImageUpload?: (file: File) => Promise<string>
  projectUsers?: string[]
  onMentionsChange?: (mentions: string[]) => void
}

type ToolbarAction = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  action: (textarea: HTMLTextAreaElement, value: string, onChange: (v: string) => void) => void
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  before: string,
  after: string,
  placeholder = ''
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = value.slice(start, end) || placeholder
  const newValue = value.slice(0, start) + before + selected + after + value.slice(end)
  onChange(newValue)
  setTimeout(() => {
    textarea.focus()
    const newStart = start + before.length
    const newEnd = newStart + selected.length
    textarea.setSelectionRange(newStart, newEnd)
  }, 0)
}

function prependLine(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
  placeholder = 'Texto'
) {
  const start = textarea.selectionStart
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', start)
  const lineEndActual = lineEnd === -1 ? value.length : lineEnd
  const line = value.slice(lineStart, lineEndActual)
  const newLine = line.startsWith(prefix) ? line.slice(prefix.length) : prefix + (line || placeholder)
  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEndActual)
  onChange(newValue)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length)
  }, 0)
}

const toolbarActions: (ToolbarAction | 'sep')[] = [
  { icon: Bold, title: 'Negrito', action: (ta, v, c) => wrapSelection(ta, v, c, '**', '**', 'texto') },
  { icon: Italic, title: 'Itálico', action: (ta, v, c) => wrapSelection(ta, v, c, '_', '_', 'texto') },
  { icon: Strikethrough, title: 'Tachado', action: (ta, v, c) => wrapSelection(ta, v, c, '~~', '~~', 'texto') },
  'sep',
  { icon: Heading1, title: 'Título 1', action: (ta, v, c) => prependLine(ta, v, c, '# ') },
  { icon: Heading2, title: 'Título 2', action: (ta, v, c) => prependLine(ta, v, c, '## ') },
  { icon: Heading3, title: 'Título 3', action: (ta, v, c) => prependLine(ta, v, c, '### ') },
  'sep',
  { icon: List, title: 'Lista', action: (ta, v, c) => prependLine(ta, v, c, '- ') },
  { icon: ListOrdered, title: 'Lista numerada', action: (ta, v, c) => prependLine(ta, v, c, '1. ') },
  { icon: Quote, title: 'Citação', action: (ta, v, c) => prependLine(ta, v, c, '> ') },
  'sep',
  { icon: Code, title: 'Código', action: (ta, v, c) => wrapSelection(ta, v, c, '`', '`', 'código') },
  {
    icon: Minus, title: 'Separador', action: (ta, v, c) => {
      const start = ta.selectionStart
      const newValue = v.slice(0, start) + '\n---\n' + v.slice(start)
      c(newValue)
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 5, start + 5) }, 0)
    },
  },
  'sep',
  {
    icon: Link2, title: 'Link', action: (ta, v, c) => {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = v.slice(start, end) || 'texto do link'
      const insertion = `[${selected}](url)`
      const newValue = v.slice(0, start) + insertion + v.slice(end)
      c(newValue)
      setTimeout(() => {
        ta.focus()
        const urlStart = start + selected.length + 3
        ta.setSelectionRange(urlStart, urlStart + 3)
      }, 0)
    },
  },
  {
    icon: Image, title: 'Imagem', action: (ta, v, c) => {
      const start = ta.selectionStart
      const insertion = '![alt](url)'
      const newValue = v.slice(0, start) + insertion + v.slice(start)
      c(newValue)
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 5) }, 0)
    },
  },
]

function getActiveMentionPrefix(value: string, caretPos: number): string | null {
  const before = value.slice(0, caretPos)
  const match = before.match(/@([\w.+-]*)$/)
  return match ? match[1] : null
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Escreva em markdown...',
  minHeight = 200,
  className,
  onImageUpload,
  projectUsers = [],
  onMentionsChange,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionPrefix, setMentionPrefix] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const filteredUsers = mentionPrefix !== null
    ? projectUsers.filter(u => u.toLowerCase().includes(mentionPrefix.toLowerCase()))
    : []

  useEffect(() => {
    if (onMentionsChange) {
      const matches = [...value.matchAll(/@([\w.+-]+@[\w-]+\.[\w.]+)/g)]
      const mentions = [...new Set(matches.map(m => m[1]))]
      onMentionsChange(mentions)
    }
  }, [value, onMentionsChange])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    const caret = e.target.selectionStart
    const prefix = getActiveMentionPrefix(newValue, caret)
    setMentionPrefix(prefix)
    setMentionIndex(0)
  }

  const insertMention = (email: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart
    const before = value.slice(0, caret)
    const atIdx = before.lastIndexOf('@')
    const newValue = value.slice(0, atIdx) + `@${email}` + value.slice(caret)
    onChange(newValue)
    setMentionPrefix(null)
    setTimeout(() => {
      ta.focus()
      const pos = atIdx + email.length + 1
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionPrefix !== null && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => Math.min(i + 1, filteredUsers.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredUsers[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionPrefix(null)
        return
      }
    }
  }

  const handleAction = useCallback(
    (action: ToolbarAction['action']) => {
      const ta = textareaRef.current
      if (!ta) return
      action(ta, value, onChange)
    },
    [value, onChange]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLTextAreaElement>) => {
      if (!onImageUpload) return
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
      for (const file of files) {
        try {
          const url = await onImageUpload(file)
          onChange(value + '\n' + `![${file.name}](${url})`)
        } catch { /* skip */ }
      }
    },
    [onImageUpload, value, onChange]
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onImageUpload) return
      const items = Array.from(e.clipboardData.items).filter(item => item.type.startsWith('image/'))
      if (items.length === 0) return
      e.preventDefault()
      for (const item of items) {
        const file = item.getAsFile()
        if (!file) continue
        try {
          const url = await onImageUpload(file)
          onChange(value + '\n' + `![imagem](${url})`)
        } catch { /* skip */ }
      }
    },
    [onImageUpload, value, onChange]
  )

  return (
    <div className={cn('border border-gray-200 rounded-lg overflow-hidden bg-white', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
        {toolbarActions.map((item, i) =>
          item === 'sep' ? (
            <div key={i} className="w-px h-5 bg-gray-200 mx-1" />
          ) : (
            <button
              key={item.title}
              type="button"
              title={item.title}
              onClick={() => handleAction(item.action)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <item.icon className="w-3.5 h-3.5" />
            </button>
          )
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
          className="text-xs h-7 gap-1"
        >
          {mode === 'edit' ? (
            <><Eye className="w-3.5 h-3.5" /> Prévia</>
          ) : (
            <><Edit3 className="w-3.5 h-3.5" /> Editar</>
          )}
        </Button>
      </div>

      {/* Editor / Preview */}
      {mode === 'edit' ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setMentionPrefix(null), 150)}
            placeholder={placeholder}
            onDrop={handleDrop}
            onPaste={handlePaste}
            className="w-full resize-y p-3 text-sm font-mono text-gray-900 focus:outline-none leading-relaxed bg-white"
            style={{ minHeight }}
          />
          {/* @mention autocomplete */}
          {mentionPrefix !== null && filteredUsers.length > 0 && (
            <div className="absolute left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-48"
              style={{ bottom: '100%', marginBottom: 4 }}
            >
              {filteredUsers.map((u, i) => (
                <button
                  key={u}
                  type="button"
                  onMouseDown={() => insertMention(u)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 transition-colors',
                    i === mentionIndex && 'bg-purple-50 text-purple-700'
                  )}
                >
                  @{u}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="prose prose-sm max-w-none p-4 text-gray-900 leading-relaxed" style={{ minHeight }}>
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-gray-400 italic">Nenhum conteúdo para pré-visualizar.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function InlineMarkdownField({
  value, onChange, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full resize-none rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
        'px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400',
        'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent',
        className,
      )}
      rows={4}
    />
  )
}

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  if (!content) return null
  return (
    <div className={cn('prose prose-sm max-w-none text-gray-800 leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
