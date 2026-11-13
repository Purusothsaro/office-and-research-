import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ ease: 'expo.out', duration: 1 });
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };
