const guideButton = document.querySelector("#guide-button");
const guideStatus = document.querySelector("#guide-status");
const guideResults = document.querySelector("#guide-results");
const placeName = document.querySelector("#place-name");
const factList = document.querySelector("#fact-list");

const reverseGeocodeUrl = (latitude, longitude) =>
  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=nb`;

const nearbyFactsUrl = (latitude, longitude) =>
  `https://no.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${latitude}|${longitude}&gsradius=10000&gslimit=3&format=json&origin=*`;

const getPlaceName = (address) =>
  address.city ||
  address.town ||
  address.village ||
  address.municipality ||
  address.county ||
  address.state ||
  "området ditt";

const fetchFacts = async (latitude, longitude) => {
  const geosearchResponse = await fetch(nearbyFactsUrl(latitude, longitude));
  if (!geosearchResponse.ok) {
    throw new Error("Nearby places could not be found.");
  }

  const { query } = await geosearchResponse.json();
  const nearbyPlaces = query?.geosearch ?? [];
  const summaries = await Promise.all(
    nearbyPlaces.map(async ({ title }) => {
      const summaryUrl = `https://no.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
      const summaryResponse = await fetch(summaryUrl);
      if (!summaryResponse.ok) {
        return null;
      }

      const summary = await summaryResponse.json();
      return summary.extract || null;
    }),
  );

  return summaries.filter(Boolean).slice(0, 3);
};

const speak = (text) => {
  if (!("speechSynthesis" in window)) {
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "nb-NO";
  window.speechSynthesis.speak(utterance);
  return true;
};

guideButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    guideStatus.textContent = "Location is not supported by this browser.";
    return;
  }

  guideButton.disabled = true;
  guideResults.hidden = true;
  guideStatus.textContent = "Finding your location and nearby stories...";

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const { latitude, longitude } = coords;
        const locationResponse = await fetch(
          reverseGeocodeUrl(latitude, longitude),
        );
        if (!locationResponse.ok) {
          throw new Error("Your place could not be identified.");
        }

        const location = await locationResponse.json();
        const name = getPlaceName(location.address || {});
        const facts = await fetchFacts(latitude, longitude);
        const visibleFacts = facts.length
          ? facts
          : [`Du er ved ${location.display_name || name}.`];

        placeName.textContent = name;
        factList.replaceChildren(
          ...visibleFacts.map((fact) => {
            const item = document.createElement("li");
            item.textContent = fact;
            return item;
          }),
        );
        guideResults.hidden = false;
        guideStatus.textContent = `Her er det jeg fant nær ${name}.`;

        const narration = `Du er nær ${name}. ${visibleFacts.join(" ")}`;
        if (!speak(narration)) {
          guideStatus.textContent +=
            " Your browser does not support spoken audio.";
        }
      } catch (error) {
        guideStatus.textContent =
          error instanceof Error
            ? error.message
            : "We could not find stories about this location.";
      } finally {
        guideButton.disabled = false;
      }
    },
    ({ code }) => {
      guideStatus.textContent =
        code === 1
          ? "Location permission was denied."
          : "We could not determine your location right now.";
      guideButton.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    },
  );
});
