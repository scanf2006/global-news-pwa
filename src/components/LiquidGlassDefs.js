'use client';

import { useEffect } from 'react';

const REFRACTION_QUERY =
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (prefers-reduced-transparency: no-preference) and (prefers-contrast: no-preference)';

// SVG 背景折射目前只在 Chromium 中可靠，其他浏览器保留普通玻璃效果
function supportsBackdropRefraction() {
    const brands = navigator.userAgentData?.brands || [];
    return brands.some(({ brand }) => brand === 'Chromium');
}

export default function LiquidGlassDefs() {
    useEffect(() => {
        const media = window.matchMedia(REFRACTION_QUERY);
        const update = () => {
            if (media.matches && supportsBackdropRefraction()) {
                document.documentElement.dataset.glassRefraction = 'on';
            } else {
                delete document.documentElement.dataset.glassRefraction;
            }
        };

        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    return (
        <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
            <filter
                id="liquid-glass-refraction"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
                colorInterpolationFilters="sRGB"
            >
                <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.008 0.012"
                    numOctaves="2"
                    seed="7"
                    result="noise"
                />
                <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
                <feDisplacementMap
                    in="SourceGraphic"
                    in2="softNoise"
                    scale="34"
                    xChannelSelector="R"
                    yChannelSelector="G"
                />
            </filter>
        </svg>
    );
}
