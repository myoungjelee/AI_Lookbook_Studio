/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f5f5f7',
                    100: '#e8e8eb',
                    200: '#d1d1d6',
                    300: '#b1b1b8',
                    400: '#8c8c92',
                    500: '#6f6f76',
                    600: '#525257',
                    700: '#3a3a3f',
                    800: '#1f1f21',
                    900: '#111112',
                },
                accent: '#111111',
                muted: '#6f6f6f',
            },
            fontFamily: {
                sans: ['\'Noto Sans KR\'', '\'Spoqa Han Sans Neo\'', '\'Apple SD Gothic Neo\'', '\'Malgun Gothic\'', 'Segoe UI', 'sans-serif'],
            },
            borderRadius: {
                xl: '12px',
            },
        },
    },
    plugins: [],
};
