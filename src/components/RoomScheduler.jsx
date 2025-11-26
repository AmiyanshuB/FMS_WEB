// src/components/RoomScheduler.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { connectSocket } from '../lib/socket';

// Helpers
const pad = (n) => n.toString().padStart(2, '0');

const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
};

const hhmmToMinutes = (str) => {
  if (!str) return 0;
  const [h, m] = String(str).split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
};

const formatDateKey = (date) => format(date, 'yyyy-MM-dd');
const getDayName = (date) => format(date, 'EEEE');

// Time range for the grid (8 AM to 8 PM, every 30 minutes)
const GRID_START_MINUTES = 8 * 60;
const GRID_END_MINUTES = 20 * 60;
const SLOT_STEP = 30;

const buildTimeSlots = () => {
  const slots = [];
  for (let t = GRID_START_MINUTES; t < GRID_END_MINUTES; t += SLOT_STEP) {
    slots.push(minutesToHHMM(t));
  }
  return slots;
};

const TIME_SLOTS = buildTimeSlots();

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_URL &&
    import.meta.env.VITE_API_URL.replace(/\/$/, '')) ||
  '';

export default function RoomScheduler() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [schedule, setSchedule] = useState([]); // weekly fixed
  const [events, setEvents] = useState([]); // all events, filter client-side
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message }

  const [editing, setEditing] = useState(null);
  // editing = { room, startTime, endTime, title, type: 'fixed' | 'event', eventId? }

  // --- detect admin via token in localStorage ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = window.localStorage.getItem('token');
    setIsAdmin(!!token);

    const authHandler = () => {
      const t = window.localStorage.getItem('token');
      setIsAdmin(!!t);
    };

    window.addEventListener('storage', authHandler);
    window.addEventListener('auth-change', authHandler);

    const onlineHandler = () => setIsOffline(false);
    const offlineHandler = () => setIsOffline(true);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);

    return () => {
      window.removeEventListener('storage', authHandler);
      window.removeEventListener('auth-change', authHandler);
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  //--- Socket.io live sync ---
  useEffect(() => {
    const socket = connectSocket(API_BASE);

    const onScheduleUpdate = (incoming) => {
      if (Array.isArray(incoming)) setSchedule(incoming);
    };
    const onEventsUpdate = (incoming) => {
      if (Array.isArray(incoming)) setEvents(incoming);
    };

    const onConnect = () => setIsOffline(false);
    const onDisconnect = () => setIsOffline(true);

    socket.on('schedule:update', onScheduleUpdate);
    socket.on('events:update', onEventsUpdate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Ask server to send latest (useful if we connected late)
    socket.emit('request:schedule');
    socket.emit('request:events');

    return () => {
      socket.off('schedule:update', onScheduleUpdate);
      socket.off('events:update', onEventsUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  //--- Initial fetch via REST (helps even if sockets misbehave) ---
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setLoading(true);
        setError('');
        const base = API_BASE || '';
        const [schRes, evRes] = await Promise.all([
          fetch(`${base}/api/schedule`),
          fetch(`${base}/api/events`)
        ]);
        if (!schRes.ok) throw new Error('Failed to load weekly schedule');
        if (!evRes.ok) throw new Error('Failed to load events');
        const schJson = await schRes.json();
        const evJson = await evRes.json();
        setSchedule(Array.isArray(schJson) ? schJson : []);
        setEvents(Array.isArray(evJson) ? evJson : []);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load timetable');
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
  }, []);

  const dayName = getDayName(selectedDate);
  const dateKey = formatDateKey(selectedDate);

  // Filter events for selected date
  const eventsForDay = useMemo(
    () => events.filter((ev) => ev.date === dateKey),
    [events, dateKey]
  );

  // Build list of rooms from both schedule + events
  const rooms = useMemo(() => {
    const sRooms = schedule.map((s) => s.room).filter(Boolean);
    const eRooms = eventsForDay.map((e) => e.room).filter(Boolean);
    return Array.from(new Set([...sRooms, ...eRooms])).sort();
  }, [schedule, eventsForDay]);

  // Build grid: rooms x timeslots
  const grid = useMemo(() => {
    const result = {};
    for (const room of rooms) {
      result[room] = {};
    }

    // weekly fixed classes -> red
    for (const item of schedule) {
      if (!item || item.day !== dayName) continue;
      const room = item.room;
      if (!result[room]) result[room] = {};
      const sMin = hhmmToMinutes(item.startTime);
      const eMin = hhmmToMinutes(item.endTime);
      for (let t = sMin; t < eMin; t += SLOT_STEP) {
        const key = minutesToHHMM(t);
        if (!TIME_SLOTS.includes(key)) continue;
        result[room][key] = {
          label: item.className || item.class || 'Class',
          type: 'fixed',
          startTime: item.startTime,
          endTime: item.endTime,
          source: item
        };
      }
    }

    // date-specific events -> blue
    for (const ev of eventsForDay) {
      const room = ev.room;
      if (!result[room]) result[room] = {};
      const sMin = hhmmToMinutes(ev.startTime);
      const eMin = hhmmToMinutes(ev.endTime);
      for (let t = sMin; t < eMin; t += SLOT_STEP) {
        const key = minutesToHHMM(t);
        if (!TIME_SLOTS.includes(key)) continue;
        result[room][key] = {
          label: ev.eventName || 'Event',
          type: 'event',
          startTime: ev.startTime,
          endTime: ev.endTime,
          eventId: ev.id,
          source: ev
        };
      }
    }

    return result;
  }, [rooms, schedule, eventsForDay, dayName]);

  // --- Editing helpers ---

  const openEditor = (room, slot) => {
    if (!isAdmin) return;
    const row = grid[room] || {};
    const cell = row[slot];

    if (cell) {
      // Editing an existing block
      setEditing({
        room,
        startTime: cell.startTime || slot,
        endTime:
          cell.endTime || minutesToHHMM(hhmmToMinutes(slot) + SLOT_STEP),
        title: cell.label || '',
        type: cell.type, // 'fixed' | 'event'
        eventId: cell.eventId || null
      });
    } else {
      // Creating a new one in this slot
      const startTime = slot;
      const endTime = minutesToHHMM(hhmmToMinutes(slot) + SLOT_STEP);
      setEditing({
        room,
        startTime,
        endTime,
        title: '',
        type: 'fixed',
        eventId: null
      });
    }
  };

  const closeEditor = () => setEditing(null);

  // Update editing fields
  const updateEditingField = (field, value) => {
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2200);
  };

  // --- API helpers for mutations ---

  const getAuthHeaders = () => {
    if (typeof window === 'undefined') return {};
    const token = window.localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const saveWeeklySlot = async (day, room, startTime, endTime, className) => {
    const base = API_BASE || '';
    const res = await fetch(`${base}/api/schedule/slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ day, room, startTime, endTime, className })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.message || 'Failed to update schedule');
    }
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.schedule)) {
      setSchedule(j.schedule);
    }
  };

  const saveEvent = async (payload) => {
    const base = API_BASE || '';
    const res = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.message || 'Failed to update events');
    }
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.events)) {
      setEvents(j.events);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      setError('');
      const { room, startTime, endTime, title, type, eventId } = editing;
      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) {
        throw new Error('Please enter a title');
      }

      if (type === 'fixed') {
        await saveWeeklySlot(dayName, room, startTime, endTime, trimmedTitle);
      } else {
        if (eventId) {
          await saveEvent({
            action: 'update',
            id: eventId,
            date: dateKey,
            room,
            startTime,
            endTime,
            eventName: trimmedTitle
          });
        } else {
          await saveEvent({
            action: 'create',
            date: dateKey,
            room,
            startTime,
            endTime,
            eventName: trimmedTitle
          });
        }
      }
      setEditing(null);
      showToast('success', 'Timetable updated');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Save failed');
      showToast('error', e.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    const confirmed = window.confirm('Delete this entry?');
    if (!confirmed) return;

    try {
      setError('');
      const { room, startTime, endTime, type, eventId } = editing;

      if (type === 'fixed') {
        // Delete fixed class by sending empty className; backend treats as delete for overlapping block
        await saveWeeklySlot(dayName, room, startTime, endTime, '');
      } else if (eventId) {
        await saveEvent({ action: 'delete', id: eventId });
      }
      setEditing(null);
      showToast('success', 'Entry deleted');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Delete failed');
      showToast('error', e.message || 'Delete failed');
    }
  };

  // --- Handlers ---

  const onDateChange = (e) => {
    const value = e.target.value;
    if (!value) return;
    const d = parseISO(value);
    if (!isNaN(d.getTime())) {
      setSelectedDate(d);
    }
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="scheduler-root">
      {/* Offline / sync banner */}
      {isOffline && (
        <div className="offline-banner" role="status">
          You are offline. Changes will retry when connection is restored.
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" aria-label="Timetable controls">
        <div className="toolbar-left">
          <label className="label" htmlFor="date-picker">
            Date
          </label>
          <input
            id="date-picker"
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={onDateChange}
            className="input input--date"
          />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={goToToday}
          >
            Today
          </button>
          <div className="toolbar-day-label" aria-live="polite">
            {dayName}
          </div>
        </div>

        <div className="toolbar-right">
          <div className="legend" aria-hidden="true">
            <div className="legend-item">
              <div className="sw sw-fixed" />
              <span>Fixed class</span>
            </div>
            <div className="legend-item">
              <div className="sw sw-event" />
              <span>Event</span>
            </div>
          </div>
          {isAdmin && (
            <div className="admin-chip" aria-label="Admin editing enabled">
              Admin mode
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-muted text-sm" style={{ marginTop: 8 }}>
          Loading timetable…
        </div>
      )}
      {error && (
        <div className="text-error text-sm" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      {/* Timetable grid */}
      <div
        className="card timeline"
        aria-label="Room timetable grid"
        role="grid"
      >
        <h2 className="section-title">
          Schedule for {format(selectedDate, 'MMMM d, yyyy')}
        </h2>

        <div className="grid-header">
          <div className="room-col">Room / Time</div>
          <div className="times-row">
            {TIME_SLOTS.map((slot) => (
              <div key={slot} className="time-cell">
                {slot}
              </div>
            ))}
          </div>
        </div>

        {rooms.length === 0 && (
          <div className="empty-state">
            No rooms for this day yet.{' '}
            {isAdmin
              ? 'Tap a time slot to start adding classes or events.'
              : ''}
          </div>
        )}

        {rooms.map((room) => (
          <div key={room} className="row" role="row">
            <div className="room-col" role="rowheader">
              {room}
            </div>
            <div className="times-row">
              {TIME_SLOTS.map((slot) => {
                const cell = (grid[room] && grid[room][slot]) || null;
                const isEditing =
                  editing &&
                  editing.room === room &&
                  editing.startTime === slot;

                let className = 'slot';
                if (cell) {
                  className += cell.type === 'fixed' ? ' fixed' : ' event';
                }
                if (isEditing) {
                  className += ' slot--selected';
                }

                const labelParts = [];
                labelParts.push(`Room ${room}`);
                labelParts.push(`at ${slot}`);
                if (cell && cell.label) {
                  labelParts.push(cell.label);
                }

                return (
                  <button
                    key={slot}
                    type="button"
                    className={className}
                    onClick={() => openEditor(room, slot)}
                    disabled={!isAdmin}
                    aria-label={labelParts.join(', ')}
                  >
                    {cell && (
                      <span className="slot-label" title={cell.label}>
                        {cell.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom sheet editor */}
      {editing && (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-sheet-title"
          onClick={closeEditor}
        >
          <div
            className="bottom-sheet open"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bottom-sheet-handle" />

            <div className="bottom-sheet-header">
              <div>
                <h3 id="edit-sheet-title" className="bottom-sheet-title">
                  {editing.eventId || editing.type === 'event'
                    ? 'Edit event'
                    : 'Edit class'}
                </h3>
                <p className="bottom-sheet-subtitle">
                  {editing.room} • {dayName}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-icon"
                onClick={closeEditor}
                aria-label="Close editor"
              >
                ×
              </button>
            </div>

            <div className="bottom-sheet-body">
              <label className="field-label">
                Title
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) =>
                    updateEditingField('title', e.target.value)
                  }
                  placeholder="Class or event name"
                />
              </label>

              <div className="field-row">
                <label className="field-label">
                  Start time
                  <input
                    type="time"
                    className="input"
                    value={editing.startTime}
                    onChange={(e) =>
                      updateEditingField('startTime', e.target.value)
                    }
                  />
                </label>
                <label className="field-label">
                  End time
                  <input
                    type="time"
                    className="input"
                    value={editing.endTime}
                    onChange={(e) =>
                      updateEditingField('endTime', e.target.value)
                    }
                  />
                </label>
              </div>

              <fieldset className="field-group">
                <legend className="field-label">Type</legend>
                <div className="radio-row">
                  <label className="radio-label">
                    <input
                      type="radio"
                      checked={editing.type === 'fixed'}
                      onChange={() => updateEditingField('type', 'fixed')}
                    />
                    <span>Apply to master (weekly)</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      checked={editing.type === 'event'}
                      onChange={() => updateEditingField('type', 'event')}
                    />
                    <span>Date-specific event only</span>
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="bottom-sheet-actions">
              {editing.eventId || editing.title ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={
            'toast ' + (toast.type === 'error' ? 'toast-error' : 'toast-ok')
          }
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
