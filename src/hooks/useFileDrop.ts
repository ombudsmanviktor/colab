import { useState, useEffect, useRef } from 'react'

/**
 * Listens for file drag-and-drop anywhere on the page.
 * Uses a counter to correctly handle dragenter/dragleave bubbling
 * (each child element fires its own enter/leave pair, so a naive boolean
 * would flicker as the drag moves across child elements).
 */
export function useFileDrop(onDrop: (file: File) => void): boolean {
  const [isDragging, setIsDragging] = useState(false)
  const counter = useRef(0)
  const cbRef = useRef(onDrop)

  // Keep callback ref current without re-subscribing event listeners
  useEffect(() => { cbRef.current = onDrop })

  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      if (++counter.current === 1) setIsDragging(true)
    }

    function onLeave() {
      if (--counter.current <= 0) {
        counter.current = 0
        setIsDragging(false)
      }
    }

    function onOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }

    function onDropEvent(e: DragEvent) {
      e.preventDefault()
      counter.current = 0
      setIsDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) cbRef.current(file)
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDropEvent)

    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDropEvent)
    }
  }, [])

  return isDragging
}
