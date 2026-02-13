export type VisualState = 'blank' | 'fadein' | 'visible' | 'fadeout';

export interface StateMachine {
  state: VisualState;
  stateStart: number;
  update(globalTime: number, albumUri: string, visibleAlbumUri: string): {
    progress: number;
    newState: VisualState;
    newVisibleUri: string | null;
    needsVectors: boolean;
  };
}

export function createStateMachine(): StateMachine {
  const sm: StateMachine = {
    state: 'blank',
    stateStart: 0,
    update(globalTime, albumUri, visibleAlbumUri) {
      let progress = -2.0;
      let needsVectors = false;
      let newVisibleUri: string | null = null;
      const stateTime = globalTime - sm.stateStart;

      if (sm.state === 'blank') {
        progress = -2.0;
        if (albumUri && albumUri !== visibleAlbumUri) {
          newVisibleUri = albumUri;
          needsVectors = true;
        }
      } else if (sm.state === 'fadein') {
        progress = -2.0 + stateTime / 7000.0;
        if (stateTime > 14000.0) {
          sm.state = 'visible';
          sm.stateStart = globalTime;
        }
      } else if (sm.state === 'visible') {
        progress = 0.0;
        if (albumUri !== visibleAlbumUri) {
          sm.state = 'fadeout';
          sm.stateStart = globalTime;
        }
      } else if (sm.state === 'fadeout') {
        progress = 0.0 + stateTime / 2500.0;
        if (stateTime > 5000.0) {
          sm.state = 'blank';
          sm.stateStart = globalTime;
        }
      }

      return { progress, newState: sm.state, newVisibleUri, needsVectors };
    },
  };
  return sm;
}
