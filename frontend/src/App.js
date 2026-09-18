import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/api',
});

const THEME_KEY = 'equipe-sudo:tema';
const THEME_COLOR = { dark: '#0b0e0d', light: '#e7e4dd' };
const INPUT_ID = 'nova-tarefa';

function readInitialTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (err) {
    /* modo privado bloqueia o storage — segue a preferência do sistema */
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z" />
    </svg>
  );
}

function App() {
  const [theme, setTheme] = useState(readInitialTheme);
  const [todos, setTodos] = useState([]);
  const [status, setStatus] = useState('loading');
  const [task, setTask] = useState('');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', THEME_COLOR[theme]);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* sem storage: o tema vale só para esta sessão */
    }
  }, [theme]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await api.get('/todos');
      setTodos(response.data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const done = todos.filter((todo) => todo.completed).length;
    return { total: todos.length, done, open: todos.length - done };
  }, [todos]);

  const addTodo = async (event) => {
    event.preventDefault();
    const text = task.trim();
    if (!text || adding) return;

    setAdding(true);
    try {
      const response = await api.post('/todos', { text });
      setTodos((current) => [...current, response.data]);
      setTask('');
      setStatus('ready');
    } catch (err) {
      setStatus('error');
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  const toggleComplete = useCallback(async (id) => {
    try {
      const response = await api.patch(`/todos/${id}`);
      setTodos((current) => current.map((todo) => (todo._id === id ? response.data : todo)));
      setFlash(id);
      window.setTimeout(() => setFlash(null), 340);
    } catch (err) {
      setStatus('error');
    }
  }, []);

  const deleteTodo = useCallback(async (id) => {
    try {
      await api.delete(`/todos/${id}`);
      setTodos((current) => current.filter((todo) => todo._id !== id));
    } catch (err) {
      setStatus('error');
    }
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className="app">
      <main className="win">
        <header className="win__chrome">
          <p className="win__host">
            <strong>sudo</strong>@equipe-sudo
            <span className="win__path">:~/tarefas</span>
          </p>
          <button
            type="button"
            className="theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            title={isDark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? 'claro' : 'escuro'}
          </button>
        </header>

        <section className="win__body" aria-label="Tarefas">
          {status === 'loading' && (
            <p className="notice">
              <span className="dots">carregando</span>
            </p>
          )}

          {status === 'error' && (
            <p className="notice" data-kind="error" role="alert">
              não foi possível falar com a API.
              <button type="button" className="notice__retry" onClick={load}>
                tentar de novo
              </button>
            </p>
          )}

          {status === 'ready' && counts.total === 0 && (
            <p className="notice">nenhuma tarefa ainda — digite abaixo e pressione enter.</p>
          )}

          {status !== 'loading' &&
            todos.map((todo) => (
              <div
                className="task"
                key={todo._id}
                data-done={todo.completed}
                data-flash={flash === todo._id}
              >
                <button
                  type="button"
                  className="task__toggle"
                  aria-pressed={todo.completed}
                  aria-label={
                    todo.completed
                      ? `Reabrir a tarefa ${todo.text}`
                      : `Concluir a tarefa ${todo.text}`
                  }
                  onClick={() => toggleComplete(todo._id)}
                >
                  <span className="task__state">{todo.completed ? '[x]' : '[ ]'}</span>
                  <span className="task__text">{todo.text}</span>
                </button>
                <button
                  type="button"
                  className="task__kill"
                  onClick={() => deleteTodo(todo._id)}
                  aria-label={`Excluir a tarefa ${todo.text}`}
                >
                  excluir
                </button>
              </div>
            ))}
        </section>

        <footer className="win__foot">
          <div className="win__status">
            <span className="win__counts" aria-live="polite">
              <b>{counts.open}</b> {counts.open === 1 ? 'aberta' : 'abertas'} · <b>{counts.done}</b>{' '}
              {counts.done === 1 ? 'concluída' : 'concluídas'}
            </span>
            <span className="win__hint" aria-hidden="true">
              enter adiciona
            </span>
          </div>

          <form className="prompt" onSubmit={addTodo} data-busy={adding}>
            <label className="sr-only" htmlFor={INPUT_ID}>
              Nova tarefa
            </label>
            <span className="prompt__sigil" aria-hidden="true">
              $
            </span>
            <input
              id={INPUT_ID}
              ref={inputRef}
              className="prompt__input"
              type="text"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder={adding ? 'enviando…' : 'nova tarefa'}
              disabled={adding}
              autoComplete="off"
              autoFocus
            />
          </form>
        </footer>
      </main>
    </div>
  );
}

export default App;
