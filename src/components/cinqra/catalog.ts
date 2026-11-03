export type View = 'explore' | 'image' | 'video' | 'cinema' | 'effects' | 'canvas' | 'library' | 'creative';
export type Recipe = { id: string; title: string; category: string; image: string; prompt: string; mode: 'image' | 'video'; tag?: string };
export const recipes: Recipe[] = [
  { id: 'desert', title: 'Beyond the ordinary', category: 'Cinematic', image: '/cinqra/desert.jpg', mode: 'video', tag: 'CINEMA', prompt: 'A lone explorer walks across vast desert dunes at golden hour, flowing fabric, sweeping aerial establishing shot, warm sand and deep shadows, photorealistic cinematic film, slow natural movement.' },
  { id: 'portrait', title: 'A character. A thousand stories.', category: 'Portraits', image: '/cinqra/portrait.jpg', mode: 'image', tag: 'CHARACTER', prompt: 'Editorial close-up portrait of a fictional woman, natural skin texture, soft window light, subtle film grain, 85mm lens, shallow depth of field, muted cinematic color grade.' },
  { id: 'city', title: 'After hours', category: 'Cinematic', image: '/cinqra/city.jpg', mode: 'video', tag: 'MOTION', prompt: 'Rain-soaked city at night, neon reflections across the pavement, slow cinematic dolly forward, atmospheric haze, deep blue and warm amber, anamorphic lens, photorealistic.' },
  { id: 'product', title: 'Made to stand out', category: 'Product', image: '/cinqra/product.jpg', mode: 'image', tag: 'PRODUCT', prompt: 'Luxury perfume product campaign, a glass bottle on a sculptural stone pedestal, dramatic side lighting, warm amber tones, elegant shadows, premium editorial still life, no text.' },
  { id: 'ocean', title: 'Somewhere, slower', category: 'Nature', image: '/cinqra/ocean.jpg', mode: 'video', prompt: 'Waves breaking on a dramatic coastline, slow drone pullback, soft morning light, sea mist, natural movement, photorealistic nature documentary with cinematic color grading.' },
  { id: 'fashion', title: 'The editorial', category: 'Fashion', image: '/cinqra/fashion.jpg', mode: 'image', prompt: 'High fashion editorial, fictional model wearing a sculptural black outfit, minimal architectural setting, dramatic daylight, editorial magazine photography, full body, no text.' },
  { id: 'space', title: 'Worlds beyond', category: 'Fantasy', image: '/cinqra/space.jpg', mode: 'image', prompt: 'A surreal alien landscape under a monumental glowing planet, tiny lone astronaut, epic scale, atmospheric volumetric lighting, cinematic science fiction concept art.' },
  { id: 'mountain', title: 'Chase the light', category: 'Nature', image: '/cinqra/mountain.jpg', mode: 'video', prompt: 'Epic mountain range at sunrise, clouds drifting through the valley, slow aerial orbit, warm rim lighting on snowy peaks, cinematic nature documentary, photorealistic.' },
];
export const effects = [
  { name: 'Dolly zoom', note: 'Keep the subject. Bend the world.', prompt: 'Dolly zoom camera movement, camera moves backward while zooming in, subject stays the same size and background expands dramatically.' },
  { name: '360° orbit', note: 'Every angle tells a story.', prompt: 'Smooth 360-degree camera orbit around the central subject, consistent identity, cinematic parallax, stable lighting.' },
  { name: 'Slow motion', note: 'Make a moment last.', prompt: 'Ultra slow motion, suspended particles, graceful fluid movement, high-speed cinematography, sharply detailed subject.' },
  { name: 'FPV flight', note: 'Put the viewer in motion.', prompt: 'Dynamic FPV drone flight, sweeping movement through the scene, immersive wide angle perspective, fluid cinematic motion.' },
  { name: 'Film noir', note: 'Light. Shadow. Atmosphere.', prompt: 'Classic black and white film noir, dramatic hard side lighting, deep shadows, atmospheric smoke, 35mm film grain.' },
  { name: 'Golden hour', note: 'Everything in its best light.', prompt: 'Golden hour sunlight, warm luminous highlights, soft long shadows, gentle lens flare, rich cinematic film colors.' },
];
export const categories = ['All inspiration', 'Cinematic', 'Portraits', 'Product', 'Fashion', 'Nature', 'Fantasy'];
