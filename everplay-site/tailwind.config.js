module.exports = {
  content: ["./src/**/*.njk", "./src/**/*.html"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "outline": "#6d7b6a", "on-tertiary-fixed-variant": "#004395", "inverse-surface": "#2e3132",
        "on-secondary-fixed-variant": "#454749", "background": "#f8f9fa", "on-tertiary-container": "#003577",
        "on-primary-fixed": "#002106", "secondary-fixed-dim": "#c6c6c9", "on-secondary": "#ffffff",
        "surface-container-low": "#f3f4f5", "tertiary-fixed-dim": "#adc6ff", "on-primary": "#ffffff",
        "surface-bright": "#f8f9fa", "tertiary-container": "#6e9fff", "surface-variant": "#e1e3e4",
        "surface-container-lowest": "#ffffff", "surface-container-high": "#e7e8e9", "primary-fixed": "#7afd86",
        "on-primary-container": "#004112", "primary": "#006e23", "surface-dim": "#d9dadb",
        "on-tertiary-fixed": "#001a42", "primary-fixed-dim": "#5ce06d", "on-tertiary": "#ffffff",
        "on-surface-variant": "#3e4a3c", "error": "#ba1a1a", "on-background": "#191c1d",
        "outline-variant": "#bdcab8", "secondary-fixed": "#e2e2e5", "secondary": "#5d5e61",
        "on-error-container": "#93000a", "on-error": "#ffffff", "surface": "#f8f9fa",
        "inverse-primary": "#5ce06d", "on-secondary-container": "#636467", "inverse-on-surface": "#f0f1f2",
        "surface-tint": "#006e23", "surface-container": "#edeeef", "tertiary-fixed": "#d8e2ff",
        "on-secondary-fixed": "#1a1c1e", "on-surface": "#191c1d", "tertiary": "#005ac2",
        "on-primary-fixed-variant": "#005319", "surface-container-highest": "#e1e3e4",
        "secondary-container": "#e2e2e5", "primary-container": "#2eb84b", "error-container": "#ffdad6"
      },
      borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px" },
      spacing: { "gutter": "24px", "section_padding": "80px", "margin_desktop": "48px", "container_max_width": "1280px", "margin_mobile": "16px", "base_unit": "8px" },
      fontFamily: {
        "headline-lg": ["Manrope"], "body-md": ["Inter"], "headline-md": ["Manrope"], "body-lg": ["Inter"],
        "display-lg": ["Manrope"], "label-md": ["Geist"], "headline-lg-mobile": ["Manrope"]
      },
      fontSize: {
        "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "700" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "display-lg": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "label-md": ["14px", { "lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "500" }],
        "headline-lg-mobile": ["28px", { "lineHeight": "36px", "fontWeight": "700" }]
      }
    }
  },
  safelist: [
    "bg-primary", "bg-tertiary", "bg-secondary", "bg-primary-container", "bg-tertiary-container",
    "text-on-primary", "text-on-tertiary", "text-on-secondary", "text-on-primary-container", "text-on-tertiary-container"
  ]
};
