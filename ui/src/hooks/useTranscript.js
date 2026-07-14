import { useReducer } from 'react';

function transcriptReducer(state, action) {
  switch (action.type) {
    case 'UPSERT': {
      const { id, text, final: isFinal, isAgent } = action;
      const idx = state.findIndex(s => s.id === id);
      if (idx === -1) return [...state, { id, text, final: isFinal, isAgent }];
      const next = [...state];
      next[idx] = { ...next[idx], text, final: isFinal };
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
