const ACCENTS = {
  "primary": { badge: "bg-primary", text: "text-on-primary" },
  "tertiary": { badge: "bg-tertiary", text: "text-on-tertiary" },
  "secondary": { badge: "bg-secondary", text: "text-on-secondary" },
  "primary-container": { badge: "bg-primary-container", text: "text-on-primary-container" },
  "tertiary-container": { badge: "bg-tertiary-container", text: "text-on-tertiary-container" }
};

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/css/style.css": "css/style.css" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/images/uploads": "images/uploads" });

  eleventyConfig.addFilter("accentBadge", (accent) => (ACCENTS[accent] || ACCENTS["primary"]).badge);
  eleventyConfig.addFilter("accentText", (accent) => (ACCENTS[accent] || ACCENTS["primary"]).text);

  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    }
  };
};
