const ACCENTS = {
  "primary": { badge: "bg-primary", text: "text-on-primary", hex: "#006e23" },
  "tertiary": { badge: "bg-tertiary", text: "text-on-tertiary", hex: "#005ac2" },
  "secondary": { badge: "bg-secondary", text: "text-on-secondary", hex: "#5d5e61" },
  "primary-container": { badge: "bg-primary-container", text: "text-on-primary-container", hex: "#2eb84b" },
  "tertiary-container": { badge: "bg-tertiary-container", text: "text-on-tertiary-container", hex: "#6e9fff" }
};

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/css/style.css": "css/style.css" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/images/uploads": "images/uploads" });

  eleventyConfig.addFilter("accentBadge", (accent) => (ACCENTS[accent] || ACCENTS["primary"]).badge);
  eleventyConfig.addFilter("accentText", (accent) => (ACCENTS[accent] || ACCENTS["primary"]).text);
  eleventyConfig.addFilter("accentHex", (accent) => (ACCENTS[accent] || ACCENTS["primary"]).hex);

  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    }
  };
};
