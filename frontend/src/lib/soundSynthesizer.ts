class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  
  // Cage spinning state
  private spinInterval: ReturnType<typeof setInterval> | null = null;
  private spinOscNode: OscillatorNode | null = null;
  private spinGainNode: GainNode | null = null;
  private spinLfo: OscillatorNode | null = null;
  private spinNoiseSource: AudioBufferSourceNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Realistic steel cage spinning sound
   * Continuous rolling axle friction noise modulated by LFO + high-density ball-to-ball and ball-to-wire clatter
   */
  startCageSpin() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      // 1. Low axle rumble + friction noise (rotation hum)
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 2.0; // 2Hz cycle speed
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 12;

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 58; // 58Hz structural hum

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 140;

      // Noise source for structural rolling friction
      const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 250;
      noiseFilter.Q.value = 1.2;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = 0.12;

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(lowpass);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);

      const mainGain = this.ctx.createGain();
      mainGain.gain.value = 0.58; // Loud, present structural sound

      lowpass.connect(mainGain);
      noiseGain.connect(mainGain);
      mainGain.connect(this.ctx.destination);

      lfo.start();
      osc.start();
      noiseSource.start();

      this.spinOscNode = osc;
      this.spinNoiseSource = noiseSource;
      this.spinLfo = lfo;
      this.spinGainNode = mainGain;

      // 2. High-density ball collisions (ball-to-ball plastic thuds & ball-to-wire steel clinks)
      this.spinInterval = setInterval(() => {
        if (!this.ctx) return;
        
        // High collision rate with 90 balls inside a fast spinning cage
        if (Math.random() > 0.8) return; 

        const now = this.ctx.currentTime;
        const isBallToBall = Math.random() > 0.5;
        const duration = isBallToBall ? 0.06 : 0.035; 
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const clickSource = this.ctx.createBufferSource();
        clickSource.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        if (isBallToBall) {
          // Lower frequency plastic hollow sound
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(450 + Math.random() * 300, now);
          filter.Q.setValueAtTime(4, now);
        } else {
          // Higher frequency steel wire chime ring
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1600 + Math.random() * 1800, now);
          filter.Q.setValueAtTime(18, now);
        }

        const clickGain = this.ctx.createGain();
        const startVolume = isBallToBall 
          ? (0.16 + Math.random() * 0.16) 
          : (0.28 + Math.random() * 0.28); 
        
        clickGain.gain.setValueAtTime(startVolume, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + duration - 0.005);

        clickSource.connect(filter);
        filter.connect(clickGain);
        clickGain.connect(this.ctx.destination);
        clickSource.start(now);
      }, 45); // Checked every 45ms for high density
      
    } catch (e) {
      console.error("Failed to start cage spin sound:", e);
    }
  }

  stopCageSpin() {
    try {
      if (this.spinInterval) {
        clearInterval(this.spinInterval);
        this.spinInterval = null;
      }
      if (this.spinOscNode) {
        try { this.spinOscNode.stop(); } catch {}
        this.spinOscNode = null;
      }
      if (this.spinLfo) {
        try { this.spinLfo.stop(); } catch {}
        this.spinLfo = null;
      }
      if (this.spinNoiseSource) {
        try { this.spinNoiseSource.stop(); } catch {}
        this.spinNoiseSource = null;
      }
      if (this.spinGainNode) {
        this.spinGainNode.disconnect();
        this.spinGainNode = null;
      }
    } catch {}
  }

  /**
   * Triumphant brassy C-major arpeggio arpeggio for celebrations
   */
  playCelebration() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const time = now + idx * 0.14;
        
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, time);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.10);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.48);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, time);

        osc.connect(gain);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc2.start(time);
        osc.stop(time + 0.5);
        osc2.stop(time + 0.5);
      });
    } catch (e) {
      console.error("Failed to play celebration sound:", e);
    }
  }

  /**
   * Apply a real-time live announcement echo/reverb feedback delay effect to any HTMLAudioElement.
   * This models a spacious gaming hall or stadium PA system.
   *
   * Reuses the SAME shared AudioContext as the cage/celebration sounds (via
   * initCtx()) instead of constructing a fresh one per call. A live game calls
   * this once per number (up to 90 times), and each number call fires from an
   * async SSE event, not a direct click — a brand-new AudioContext created
   * outside a user-gesture call stack starts (and can stay) suspended under the
   * browser's autoplay policy, so uploaded-MP3 number calls played silently even
   * though the identical code path worked fine from the Settings page's "Listen"
   * button (a real click). Reusing one context that's already been unlocked
   * avoids re-triggering that policy on every single call, and stops leaking an
   * unclosed AudioContext per number.
   */
  applyLiveAnnouncementEcho(audio: HTMLAudioElement, customVolume: number = 1.0) {
    try {
      this.initCtx();
      if (!this.ctx) {
        audio.volume = Math.min(1.0, customVolume);
        return null;
      }
      const ctx = this.ctx;

      const source = ctx.createMediaElementSource(audio);
      
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.95 * customVolume; // direct dry sound (clear, direct announcement)
      
      const delayNode = ctx.createDelay(1.0);
      delayNode.delayTime.value = 0.18; // tight 180ms room reflection delay
      
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = 0.22; // very fast echo decay (ends after 1 or 2 quick taps)
      
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.18 * customVolume; // subtle mix volume of the echo
      
      // Feedback loop
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode);
      
      // Signal routing
      source.connect(dryGain);
      source.connect(delayNode);
      delayNode.connect(wetGain);
      
      dryGain.connect(ctx.destination);
      wetGain.connect(ctx.destination);
      
      audio.addEventListener("play", () => {
        if (ctx.state === "suspended") {
          ctx.resume();
        }
      });

      return {
        updateVolume: (newVolume: number) => {
          dryGain.gain.value = 0.95 * newVolume;
          wetGain.gain.value = 0.18 * newVolume;
        }
      };
    } catch {
      audio.volume = Math.min(1.0, customVolume);
      return null;
    }
  }
}

export const soundSynthesizer = new SoundSynthesizer();
