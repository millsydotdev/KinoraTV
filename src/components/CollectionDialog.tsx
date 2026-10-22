import { useState } from 'react'
import { useStore } from '../state/store'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'

export function CollectionDialog({ open, onClose, itemRef, itemTitle }: { open: boolean; onClose: () => void; itemRef: string; itemTitle: string }) {
  const store = useStore()
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const create = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError('Give the collection a name.')
    if (store.library.collections.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return setError('You already have a collection with that name.')
    store.createCollection(trimmed, [itemRef])
    toast(`Created “${trimmed}” with ${itemTitle}`)
    setName('')
    setError('')
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add to a collection" footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>}>
      <p className="muted" style={{ marginBottom: 16 }}>Choose where {itemTitle} belongs. Collections are saved on this device.</p>
      {store.library.collections.length === 0 ? (
        <p className="faint" style={{ marginBottom: 16 }}>No collections yet. Name your first one below.</p>
      ) : (
        <ul className="collection-picks">
          {store.library.collections.map((c) => {
            const has = c.items.includes(itemRef)
            return (
              <li key={c.id}>
                <button type="button" role="checkbox" aria-checked={has} onClick={() => store.toggleInCollection(c.id, itemRef)}>
                  <span className="pick-box">{has && <Icon name="check" size={16} />}</span>
                  <span className="pick-name">{c.name}</span>
                  <span className="faint">{c.items.length} {c.items.length === 1 ? 'title' : 'titles'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form className="new-collection" onSubmit={(e) => { e.preventDefault(); create() }}>
        <label className="field" style={{ flex: 1 }}>
          <span>New collection</span>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Collection name" maxLength={40} aria-invalid={error ? true : undefined} />
        </label>
        <button type="submit" className="btn btn-ghost">Create</button>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Dialog>
  )
}
