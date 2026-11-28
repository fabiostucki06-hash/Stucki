import { useState, type FormEvent } from 'react';
import { SFCheckmark, SFXmark } from './Icons';
import { useSettings } from '../hooks/useSettings';
import { updateSettings, type TodoItem } from '../lib/settings';

/** Compact To-Do list on the Übersicht. Stored in the user's settings, so it
    follows them to every device (lib/settingsSync). Open tasks first, each
    group in the order it was added. */
export default function TodoListe() {
  const { todos } = useSettings();
  const [text, setText] = useState('');

  const setzen = (neu: TodoItem[]) => updateSettings({ todos: neu });

  function hinzufuegen(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setzen([...todos, { id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: t, erledigt: false, createdAt: new Date().toISOString() }]);
    setText('');
  }

  const umschalten = (id: string) => setzen(todos.map((t) => (t.id === id ? { ...t, erledigt: !t.erledigt } : t)));
  const loeschen = (id: string) => setzen(todos.filter((t) => t.id !== id));
  const erledigteEntfernen = () => setzen(todos.filter((t) => !t.erledigt));

  const offen = todos.filter((t) => !t.erledigt);
  const erledigt = todos.filter((t) => t.erledigt);

  return (
    <section className="todo">
      <p className="section-header" style={{ paddingLeft: 0 }}>To-Do{offen.length ? ` (${offen.length})` : ''}</p>
      <div className="inset-grouped-list">
        {[...offen, ...erledigt].map((t) => (
          <div key={t.id} className={`list-row todo-row${t.erledigt ? ' done' : ''}`}>
            <button
              type="button" className="todo-check" role="checkbox" aria-checked={t.erledigt}
              aria-label={t.erledigt ? `„${t.text}“ als offen markieren` : `„${t.text}“ erledigt`}
              onClick={() => umschalten(t.id)}
            >
              {t.erledigt && <SFCheckmark />}
            </button>
            <span className="todo-text" onClick={() => umschalten(t.id)}>{t.text}</span>
            <button type="button" className="todo-del" aria-label={`„${t.text}“ löschen`} title="Löschen" onClick={() => loeschen(t.id)}>
              <SFXmark />
            </button>
          </div>
        ))}
        <form className="list-row todo-add" onSubmit={hinzufuegen}>
          <input
            className="todo-input" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Neue Aufgabe…" aria-label="Neue Aufgabe" enterKeyHint="done" maxLength={200}
          />
          <button type="submit" className="btn-tinted" disabled={!text.trim()}>Hinzufügen</button>
        </form>
      </div>
      {erledigt.length > 0 && (
        <button type="button" className="text-danger-btn todo-clear" onClick={erledigteEntfernen}>
          Erledigte entfernen ({erledigt.length})
        </button>
      )}
    </section>
  );
}
