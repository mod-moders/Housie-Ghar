import { useConfigStore } from "./stores/configStore";

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  
  // Cage spinning state
  private spinInterval: any = null;
  private spinOscNode: OscillatorNode | null = null;
  private spinGainNode: GainNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Realistic cage spinning sound
   * Continuous rolling axle friction noise modulated by LFO + high-density ball-to-ball and ball-to-wire clatter
   */
  startCageSpin() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const config = useConfigStore.getState().config;
      const type = config?.cage_sound_type || 'steel_wooden';

      // 1. Low axle rumble + friction noise (rotation hum)
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 2.2; // Axle speed (2.2Hz cycle)
      const lfoGain = this.ctx.createGain();
      
      let humFreq = 58;
      let humType: OscillatorType = 'triangle';
      let filterFreq = 140;
      let noiseFreq = 250;
      let noiseQ = 1.2;
      let noiseVol = 0.12;
      let mainGainVal = 0.58;

      if (type === 'traditional_plastic') {
        humFreq = 110;
        humType = 'sine';
        filterFreq = 220;
        noiseFreq = 400;
        noiseQ = 0.8;
        noiseVol = 0.08;
        mainGainVal = 0.45;
      } else if (type === 'classic_wooden') {
        humFreq = 75;
        humType = 'triangle';
        filterFreq = 120;
        noiseFreq = 180;
        noiseQ = 2.0;
        noiseVol = 0.15;
        mainGainVal = 0.65;
      } else if (type === 'steel_ceramic') {
        humFreq = 62;
        humType = 'triangle';
        filterFreq = 150;
        noiseFreq = 280;
        noiseQ = 1.5;
        noiseVol = 0.16;
        mainGainVal = 0.62;
      }

      lfoGain.gain.value = type === 'classic_wooden' ? 8 : 12;

      const osc = this.ctx.createOscillator();
      osc.type = humType;
      osc.frequency.value = humFreq;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = filterFreq;

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
      noiseFilter.frequency.value = noiseFreq;
      noiseFilter.Q.value = noiseQ;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = noiseVol;

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(lowpass);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);

      const mainGain = this.ctx.createGain();
      mainGain.gain.value = mainGainVal;

      lowpass.connect(mainGain);
      noiseGain.connect(mainGain);
      mainGain.connect(this.ctx.destination);

      lfo.start();
      osc.start();
      noiseSource.start();

      this.spinOscNode = osc;
      (this as any).spinNoiseSource = noiseSource;
      (this as any).spinLfo = lfo;
      this.spinGainNode = mainGain;

      // 2. High-density ball collisions using modal physical synthesis
      this.spinInterval = setInterval(() => {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        let triggerProb = 0.2; // Probability of collision on each tick
        let isMetalClick = false;
        let isCeramicClick = false;
        let isWoodClick = false;
        let isPlasticClick = false;

        if (type === 'steel_wooden') {
          triggerProb = 0.26;
          if (Math.random() > 0.45) {
            isWoodClick = true;
          } else {
            isMetalClick = true;
          }
        } else if (type === 'steel_ceramic') {
          triggerProb = 0.26;
          if (Math.random() > 0.4) {
            isCeramicClick = true;
          } else {
            isMetalClick = true;
          }
        } else if (type === 'traditional_plastic') {
          triggerProb = 0.20;
          isPlasticClick = true;
        } else if (type === 'classic_wooden') {
          triggerProb = 0.24;
          isWoodClick = true;
        }

        if (Math.random() > triggerProb) return;

        let duration = 0.05;
        let gainVal = 0.15;
        let freqs: number[] = [];
        let decays: number[] = [];
        let amps: number[] = [];
        let noiseMix = 0.0;

        if (isWoodClick) {
          duration = 0.08;
          gainVal = 0.35 + Math.random() * 0.15;
          const base = 150 + Math.random() * 70;
          freqs = [base, base * 1.45, base * 2.1];
          decays = [85, 110, 150];
          amps = [1.0, 0.5, 0.2];
          noiseMix = 0.15;
        } else if (isMetalClick) {
          duration = 0.15;
          gainVal = 0.18 + Math.random() * 0.12;
          const base = 1600 + Math.random() * 800;
          freqs = [base, base * 2.28, base * 4.05, base * 5.75];
          decays = [15, 25, 45, 60];
          amps = [1.0, 0.6, 0.4, 0.25];
          noiseMix = 0.05;
        } else if (isCeramicClick) {
          duration = 0.12;
          gainVal = 0.20 + Math.random() * 0.12;
          const base = 2800 + Math.random() * 1200;
          freqs = [base, base * 1.85, base * 2.72, base * 4.15];
          decays = [22, 35, 55, 75];
          amps = [1.0, 0.7, 0.5, 0.3];
          noiseMix = 0.04;
        } else if (isPlasticClick) {
          duration = 0.06;
          gainVal = 0.25 + Math.random() * 0.15;
          const base = 480 + Math.random() * 220;
          freqs = [base, base * 1.58, base * 2.45, base * 3.12];
          decays = [65, 85, 115, 140];
          amps = [1.0, 0.5, 0.3, 0.15];
          noiseMix = 0.25;
        }

        const sampleRate = this.ctx.sampleRate;
        const bufferSize = Math.floor(sampleRate * duration);
        const buf = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const data = buf.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
          const t = i / sampleRate;
          let val = 0;
          for (let k = 0; k < freqs.length; k++) {
            val += amps[k] * Math.sin(2 * Math.PI * freqs[k] * t) * Math.exp(-decays[k] * t);
          }
          const noise = (Math.random() * 2 - 1) * Math.exp(-250 * t);
          data[i] = (val * (1 - noiseMix) + noise * noiseMix) * gainVal;
        }

        const clickBufSource = this.ctx.createBufferSource();
        clickBufSource.buffer = buf;

        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(1.0, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + duration - 0.002);

        clickBufSource.connect(clickGain);
        clickGain.connect(this.ctx.destination);
        clickBufSource.start(now);
      }, 40);
      
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
      if ((this as any).spinLfo) {
        try { (this as any).spinLfo.stop(); } catch {}
        (this as any).spinLfo = null;
      }
      if ((this as any).spinNoiseSource) {
        try { (this as any).spinNoiseSource.stop(); } catch {}
        (this as any).spinNoiseSource = null;
      }
      if (this.spinGainNode) {
        this.spinGainNode.disconnect();
        this.spinGainNode = null;
      }
    } catch {}
  }

  playCelebration() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const config = useConfigStore.getState().config;
      const type = config?.winner_sound_type || 'trumpet_cheering';
      const now = this.ctx.currentTime;

      // 1. Upgraded Triumphant Brass Fanfare (Detuned supersaw brass with sweeping filter)
      const playTrumpet = () => {
        if (!this.ctx) return;
        const notes = [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, G4, C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const time = now + idx * 0.12;
          const duration = 0.65;
          
          // Triple detuned sawtooth oscillators for rich chorus effect
          [-12, 0, 12].forEach((detune) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);
            osc.detune.setValueAtTime(detune, time);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            // Classic synthesizer brass sweep
            filter.frequency.setValueAtTime(3000, time);
            filter.frequency.exponentialRampToValueAtTime(1000, time + duration);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, time);
            gain.gain.linearRampToValueAtTime(0.04, time + 0.05); // quick attack
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + duration + 0.05);
          });
        });
      };

      // 2. Synthesized Stadium Crowd Cheer (with excited whistles)
      const playCrowdCheer = (durationSecs: number = 3.5, maxVolume: number = 0.22) => {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * durationSecs;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          // Pink-brown lowpass filter integration
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(550, now);
        filter.frequency.exponentialRampToValueAtTime(1050, now + 0.6);
        filter.frequency.exponentialRampToValueAtTime(450, now + durationSecs - 0.5);
        filter.Q.setValueAtTime(1.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(maxVolume, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(maxVolume * 0.5, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationSecs);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(now);

        // Render whistling spectators
        for (let w = 0; w < 3; w++) {
          const wTime = now + Math.random() * 1.5;
          const wOsc = this.ctx.createOscillator();
          wOsc.type = 'sine';
          wOsc.frequency.setValueAtTime(1000 + Math.random() * 500, wTime);
          wOsc.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 1000, wTime + 0.3);
          wOsc.frequency.exponentialRampToValueAtTime(1200, wTime + 0.8);

          const wGain = this.ctx.createGain();
          wGain.gain.setValueAtTime(0.001, wTime);
          wGain.gain.linearRampToValueAtTime(0.015, wTime + 0.1);
          wGain.gain.exponentialRampToValueAtTime(0.001, wTime + 0.8);

          wOsc.connect(wGain);
          wGain.connect(this.ctx.destination);
          wOsc.start(wTime);
          wOsc.stop(wTime + 0.85);
        }
      };

      // 3. Upgraded Physical clapping simulation (double-transient palm clicks)
      const playClapping = () => {
        if (!this.ctx) return;
        // Play 50 claps spread across 3 seconds
        for (let i = 0; i < 50; i++) {
          const clapTime = now + (i * 0.06) + Math.random() * 0.05;
          const duration = 0.08 + Math.random() * 0.04;
          
          const sampleRate = this.ctx.sampleRate;
          const bufSize = sampleRate * duration;
          const buf = this.ctx.createBuffer(1, bufSize, sampleRate);
          const data = buf.getChannelData(0);
          
          // Clap resonance envelope (palms clapping together)
          for (let s = 0; s < bufSize; s++) {
            const t = s / sampleRate;
            const envelope = Math.exp(-60 * t) + 0.4 * Math.exp(-25 * t);
            data[s] = (Math.random() * 2 - 1) * envelope;
          }
          
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1000 + Math.random() * 600, clapTime);
          filter.Q.setValueAtTime(4.0, clapTime);
          
          const gain = this.ctx.createGain();
          const timeFactor = Math.max(0.2, 1.0 - (i / 50));
          gain.gain.setValueAtTime(0.06 * timeFactor, clapTime);
          gain.gain.exponentialRampToValueAtTime(0.001, clapTime + duration - 0.005);
          
          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          
          src.start(clapTime);
        }
      };

      // 4. Formant Vocal synthesizer ("Yes!!") + sibilant ending
      const playVocalYes = () => {
        if (!this.ctx) return;
        const duration = 0.65;
        
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(95, now + duration);

        const sub = this.ctx.createOscillator();
        sub.type = 'square';
        sub.frequency.setValueAtTime(60, now);
        sub.frequency.exponentialRampToValueAtTime(75, now + 0.15);
        sub.frequency.exponentialRampToValueAtTime(47.5, now + duration);

        // Vocal Formant sweep filters
        const f1 = this.ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(400, now); // Y
        f1.frequency.exponentialRampToValueAtTime(650, now + 0.15); // E
        f1.frequency.exponentialRampToValueAtTime(350, now + duration); // S
        f1.Q.setValueAtTime(10, now);

        const f2 = this.ctx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.setValueAtTime(2000, now);
        f2.frequency.exponentialRampToValueAtTime(1700, now + 0.15);
        f2.frequency.exponentialRampToValueAtTime(1500, now + duration);
        f2.Q.setValueAtTime(10, now);

        const f3 = this.ctx.createBiquadFilter();
        f3.type = 'bandpass';
        f3.frequency.setValueAtTime(3000, now);
        f3.frequency.exponentialRampToValueAtTime(2800, now + 0.15);
        f3.Q.setValueAtTime(6, now);

        const voiceGain = this.ctx.createGain();
        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
        voiceGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(f1);
        osc.connect(f2);
        osc.connect(f3);
        sub.connect(f1);
        sub.connect(f2);
        sub.connect(f3);

        f1.connect(voiceGain);
        f2.connect(voiceGain);
        f3.connect(voiceGain);
        voiceGain.connect(this.ctx.destination);

        osc.start(now);
        sub.start(now);
        osc.stop(now + duration + 0.05);
        sub.stop(now + duration + 0.05);
        
        // Breathy "S" sibilant ending
        const sDuration = 0.20;
        const sTime = now + duration - 0.12;
        const sSampleRate = this.ctx.sampleRate;
        const sBufSize = sSampleRate * sDuration;
        const sBuf = this.ctx.createBuffer(1, sBufSize, sSampleRate);
        const sData = sBuf.getChannelData(0);
        for (let i = 0; i < sBufSize; i++) {
          sData[i] = Math.random() * 2 - 1;
        }
        const sSrc = this.ctx.createBufferSource();
        sSrc.buffer = sBuf;
        const sFilter = this.ctx.createBiquadFilter();
        sFilter.type = 'bandpass';
        sFilter.frequency.setValueAtTime(5000, sTime);
        sFilter.Q.setValueAtTime(3.0, sTime);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.001, sTime);
        sGain.gain.linearRampToValueAtTime(0.08, sTime + 0.05);
        sGain.gain.exponentialRampToValueAtTime(0.001, sTime + sDuration);

        sSrc.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(this.ctx.destination);
        sSrc.start(sTime);
      };

      // 5. Deluxe Cathedral Tubular Bell Chimes
      const playChime = () => {
        if (!this.ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const time = now + idx * 0.10;
          
          // Tubular bell partials: f, 2.76f, 5.4f
          const partials = [1.0, 2.76, 5.4];
          const partialAmps = [1.0, 0.4, 0.25];
          const partialDecays = [1.5, 0.8, 0.4];

          partials.forEach((mult, pIdx) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * mult, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.05 * partialAmps[pIdx], time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + partialDecays[pIdx]);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + partialDecays[pIdx] + 0.05);
          });
        });
      };

      // Selection Router
      if (type === 'trumpet_cheering') {
        playTrumpet();
        playCrowdCheer(3.5, 0.2);
      } else if (type === 'cheering') {
        playCrowdCheer(4.0, 0.25);
      } else if (type === 'clapping') {
        playClapping();
      } else if (type === 'voice_yes') {
        playVocalYes();
      } else if (type === 'default_chime') {
        playChime();
      } else {
        playTrumpet();
      }

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
    } catch (e) {
      audio.volume = Math.min(1.0, customVolume);
      return null;
    }
  }
}

export const soundSynthesizer = new SoundSynthesizer();
