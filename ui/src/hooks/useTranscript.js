import { useReducer } from 'react';

function transcriptReducer(state, action) {
  switch (action.type) {
    case 'UPSERT': {
      const { id, text, final: isFinal, isAgent } = action;
      const trimmedText = (text || '').trim();
      if (!trimmedText) return state;

      // 1. Try to find exact ID match
      let idx = state.findIndex(s => s.id === id);

      // 2. If not found by ID, try to find an incomplete (non-final) segment for the same role
      if (idx === -1) {
        idx = state.findIndex(s => !s.final && s.isAgent === isAgent);
      }

      // 3. If still not found, check if the last segment for the same role has duplicate or overlapping text
      if (idx === -1) {
        const lastSameRoleIdx = state.map(s => s.isAgent).lastIndexOf(isAgent);
        if (lastSameRoleIdx !== -1) {
          const lastSeg = state[lastSameRoleIdx];
          const lastText = (lastSeg.text || '').trim();
          if (
            lastText === trimmedText ||
            (trimmedText.length > lastText.length && trimmedText.startsWith(lastText)) ||
            (lastText.length > trimmedText.length && lastText.startsWith(trimmedText))
          ) {
            idx = lastSameRoleIdx;
          }
        }
      }

      if (idx === -1) {
        return [...state, { id, text: trimmedText, final: isFinal, isAgent }];
      }

      const existing = state[idx];
      const nextFinal = existing.final || isFinal;
      if (existing.text === trimmedText && existing.final === nextFinal && existing.id === id) {
        return state;
      }

      const next = [...state];
      next[idx] = { ...existing, id, text: trimmedText, final: nextFinal, isAgent };
      return next;
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

export function useTranscript() {
  const [segments, dispatchTranscript] = useReducer(transcriptReducer, []);
  return { segments, dispatchTranscript };
}

