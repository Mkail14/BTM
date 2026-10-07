<script setup>
/**
 * RatPolicier — le rat (volontairement pas beau) déguisé en policier de la page « Compte suspendu ».
 * Dessin vectoriel : casquette et uniforme, matraque dans une patte, l'autre levée pour dire « halte ».
 * `content` : suspension terminée, il baisse la garde (sourcils détendus, pas de matraque brandie).
 */
defineProps({ content: Boolean })
</script>

<template>
  <svg class="rat" viewBox="0 0 320 344" role="img" :aria-label="content ? 'Dessin d’un rat déguisé en policier, l’air satisfait' : 'Dessin d’un rat déguisé en policier, la patte levée pour dire halte'">
    <!-- projecteur -->
    <circle cx="160" cy="196" r="140" fill="#fef3c7" />
    <ellipse cx="160" cy="326" rx="96" ry="10" fill="#0f172a" opacity=".12" />

    <!-- queue -->
    <path d="M100 292 C 44 304, 16 252, 50 236 C 76 224, 88 252, 66 260" fill="none" stroke="#f4a3b4" stroke-width="9" stroke-linecap="round" />
    <path d="M40 262 l-8 6 M54 276 l-6 8 M74 288 l-3 9" stroke="#e58aa0" stroke-width="2.5" stroke-linecap="round" />

    <!-- pattes arrière -->
    <ellipse cx="126" cy="320" rx="28" ry="10" fill="#f4a3b4" />
    <ellipse cx="198" cy="321" rx="30" ry="10" fill="#f4a3b4" />
    <path d="M108 320 v6 M120 322 v6 M210 323 v6 M222 321 v6" stroke="#be5a75" stroke-width="2.5" stroke-linecap="round" />

    <!-- matraque (patte gauche) -->
    <path d="M86 266 L60 322" stroke="#111827" stroke-width="10" stroke-linecap="round" />
    <path d="M84 270 L79 281" stroke="#4b5563" stroke-width="10" stroke-linecap="round" />

    <!-- uniforme -->
    <path d="M98 320 C 80 252, 102 196, 160 196 C 220 196, 242 252, 222 320 Z" fill="#1e3a8a" />
    <path d="M160 200 C 190 214, 214 248, 208 318 L 222 320 C 242 252, 220 196, 160 196 Z" fill="#172f73" />
    <!-- col -->
    <path d="M136 200 L160 222 L146 232 Z" fill="#dbeafe" />
    <path d="M184 200 L160 222 L174 232 Z" fill="#bfdbfe" />
    <path d="M154 222 h12 l3 26 l-9 8 l-9 -8 Z" fill="#111827" />
    <!-- boutons, étiquette, insigne -->
    <circle cx="160" cy="268" r="4" fill="#fbbf24" />
    <rect x="110" y="232" width="40" height="13" rx="2.5" fill="#fff" transform="rotate(-6 130 238)" />
    <text x="130" y="242" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8.5" font-weight="700" fill="#1e3a8a" transform="rotate(-6 130 238)">POLICE</text>
    <path d="M178 232 h22 v12 q0 13 -11 18 q-11 -5 -11 -18 Z" fill="#fbbf24" stroke="#b45309" stroke-width="2" />
    <path d="M189 238 l2.6 5.2 5.8 .8 -4.2 4 1 5.7 -5.2 -2.7 -5.2 2.7 1 -5.7 -4.2 -4 5.8 -.8 Z" fill="#b45309" />
    <!-- ceinturon -->
    <path d="M90 284 Q160 300 230 284 L228 300 Q160 316 92 300 Z" fill="#111827" />
    <rect x="149" y="290" width="22" height="17" rx="3" fill="#fbbf24" stroke="#b45309" stroke-width="2" />
    <!-- épaulettes -->
    <rect x="106" y="204" width="22" height="9" rx="4" fill="#fbbf24" transform="rotate(-24 117 208)" />
    <rect x="192" y="204" width="22" height="9" rx="4" fill="#fbbf24" transform="rotate(24 203 208)" />

    <!-- bras gauche, patte sur la matraque -->
    <path d="M112 222 L88 262" stroke="#1e3a8a" stroke-width="24" stroke-linecap="round" />
    <circle cx="85" cy="268" r="12" fill="#f4a3b4" />
    <path d="M78 262 l-6 -3 M77 270 l-7 1 M80 277 l-5 5" stroke="#f4a3b4" stroke-width="5" stroke-linecap="round" />

    <!-- bras droit : levé pour dire « halte », ou le long du corps -->
    <g v-if="!content">
      <path d="M208 222 L252 180" stroke="#172f73" stroke-width="24" stroke-linecap="round" />
      <circle cx="260" cy="168" r="15" fill="#f4a3b4" />
      <path d="M249 160 L244 142 M256 155 L254 135 M264 155 L267 136 M271 161 L279 146" stroke="#f4a3b4" stroke-width="6.5" stroke-linecap="round" />
      <path d="M254 170 q6 5 12 0" fill="none" stroke="#be5a75" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else>
      <path d="M208 222 L232 262" stroke="#172f73" stroke-width="24" stroke-linecap="round" />
      <circle cx="235" cy="268" r="12" fill="#f4a3b4" />
      <path d="M242 262 l6 -3 M243 270 l7 1 M240 277 l5 5" stroke="#f4a3b4" stroke-width="5" stroke-linecap="round" />
    </g>

    <!-- oreilles (pas de la même taille, l'une rafistolée) -->
    <circle cx="98" cy="104" r="30" fill="#9ca3af" />
    <circle cx="98" cy="104" r="18" fill="#f9a8d4" />
    <circle cx="226" cy="98" r="35" fill="#9ca3af" />
    <circle cx="226" cy="98" r="22" fill="#f9a8d4" />
    <g transform="rotate(34 244 82)">
      <rect x="230" y="76" width="28" height="12" rx="4" fill="#fde7c7" stroke="#d6a66a" stroke-width="1.5" />
      <path d="M240 79 v6 M244 79 v6 M248 79 v6" stroke="#d6a66a" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- tête -->
    <ellipse cx="160" cy="146" rx="63" ry="57" fill="#9ca3af" />
    <path d="M104 160 q-12 6 -16 -6 M216 162 q14 8 18 -6 M110 176 q-10 8 -16 0" fill="none" stroke="#9ca3af" stroke-width="6" stroke-linecap="round" />
    <ellipse cx="160" cy="172" rx="36" ry="27" fill="#d1d5db" />

    <!-- yeux : un petit à moitié fermé, un gros qui louche -->
    <circle cx="134" cy="136" r="14" fill="#fff" stroke="#4b5563" stroke-width="2" />
    <circle cx="139" cy="139" r="5" fill="#111827" />
    <path d="M120 134 a14 14 0 0 1 28 -2 Z" fill="#6b7280" />
    <path d="M122 150 q12 8 24 0" fill="none" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="190" cy="132" r="20" fill="#fff" stroke="#4b5563" stroke-width="2" />
    <circle cx="183" cy="137" r="6.5" fill="#111827" />
    <circle cx="181" cy="135" r="2" fill="#fff" />
    <path d="M203 124 q-6 2 -8 8 M205 138 q-6 -1 -9 3" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round" />
    <path d="M174 154 q16 9 32 -1" fill="none" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round" />
    <!-- sourcils -->
    <path v-if="!content" d="M114 119 L150 127 M170 124 L214 110" stroke="#374151" stroke-width="7" stroke-linecap="round" />
    <path v-else d="M116 118 Q132 110 148 118 M172 108 Q192 98 212 108" fill="none" stroke="#374151" stroke-width="6" stroke-linecap="round" />

    <!-- verrue, cicatrice -->
    <circle cx="210" cy="166" r="4.5" fill="#6b7280" />
    <path d="M211 162 l3 -7 M213 164 l6 -4" stroke="#374151" stroke-width="1.4" stroke-linecap="round" />
    <path d="M108 148 l16 12 M110 156 l5 -6 M116 160 l5 -6" stroke="#6b7280" stroke-width="2" stroke-linecap="round" />

    <!-- moustaches tordues -->
    <path d="M130 170 L104 164 L84 170 M130 176 L82 184 M132 182 L108 194 L92 190" fill="none" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M190 170 L218 160 L238 168 M190 176 L240 182 M188 182 L214 196 L232 190" fill="none" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />

    <!-- museau : truffe, bouche de travers, dents du bonheur -->
    <ellipse cx="160" cy="160" rx="11" ry="8" fill="#ec4899" />
    <ellipse cx="156" cy="157" rx="3.5" ry="2" fill="#fbcfe8" />
    <path v-if="!content" d="M136 180 Q158 172 186 184" fill="none" stroke="#374151" stroke-width="4" stroke-linecap="round" />
    <path v-else d="M134 176 Q160 198 190 174" fill="none" stroke="#374151" stroke-width="4" stroke-linecap="round" />
    <path d="M149 180 h10 v17 l-5 -4 l-5 3 Z" fill="#fef3c7" stroke="#a16207" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M161 181 h11 v22 h-11 Z" fill="#fde68a" stroke="#a16207" stroke-width="1.5" stroke-linejoin="round" />

    <!-- casquette -->
    <path d="M100 100 C 96 52, 218 44, 224 92 L 220 102 L 104 108 Z" fill="#1e3a8a" />
    <path d="M100 98 Q160 112 224 92 L223 104 Q160 124 102 110 Z" fill="#111827" />
    <path d="M110 108 Q160 124 216 104 Q206 122 160 124 Q122 124 110 108 Z" fill="#0b1220" />
    <path d="M124 113 Q160 122 200 111" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" />
    <circle cx="162" cy="80" r="12" fill="#fbbf24" stroke="#b45309" stroke-width="2" />
    <path d="M162 72 l2.4 4.9 5.4 .8 -3.9 3.8 .9 5.4 -4.8 -2.6 -4.8 2.6 .9 -5.4 -3.9 -3.8 5.4 -.8 Z" fill="#b45309" />
    <!-- mèches qui dépassent -->
    <path d="M106 112 l-8 8 M112 116 l-5 10 M216 108 l9 7 M211 113 l6 10" stroke="#6b7280" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.rat { display: block; width: 100%; height: auto; }
</style>
