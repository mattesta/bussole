// Short original summaries; the linked Wikipedia articles provide further reading.
window.BussoleExplorers = {
  catalogue: [
    { name: 'Magellan', title: 'Ferdinand Magellan', article: 'Ferdinand_Magellan', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Ferdinand_Magellan.jpg/330px-Ferdinand_Magellan.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Ferdinand_Magellan.jpg", text: 'Ferdinand Magellan was a Portuguese navigator who led a Spanish expedition across the Atlantic and into the Pacific in 1519. His voyage found the strait that now bears his name. He died in the Philippines before the expedition returned; the surviving crew completed the first voyage around the world under Juan Sebastián Elcano.' },
    { name: 'Zheng He', title: 'Zheng He', article: 'Zheng_He', imageCredit: 'Marcin Konsek / Wikimedia Commons', imageLicense: 'CC BY-SA 4.0', imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/2016_Malakka%2C_Stadhuys_%2809%29.jpg/330px-2016_Malakka%2C_Stadhuys_%2809%29.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:2016_Malakka%2C_Stadhuys_%2809%29.jpg", text: 'Zheng He was a Chinese admiral during the Ming dynasty. In the early fifteenth century, he commanded seven major voyages through the Indian Ocean, reaching ports in Southeast Asia, South Asia, Arabia and East Africa. His fleets carried envoys and goods, linking distant societies through diplomacy and trade.' },
    { name: 'Nellie Bly', title: 'Nellie Bly', article: 'Nellie_Bly', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Nellie_Bly_2.jpg/330px-Nellie_Bly_2.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Nellie_Bly_2.jpg", text: 'Nellie Bly was the pen name of American journalist Elizabeth Cochrane Seaman. In 1889–1890, she travelled around the world in 72 days, turning the journey imagined by Jules Verne into a real adventure. She was also a pioneering investigative reporter, known for going undercover to expose conditions in a psychiatric institution.' },
    { name: 'Ibn Battuta', title: 'Ibn Battuta', article: 'Ibn_Battuta', imageCredit: 'Léon Benett (reproduction) · Public domain', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Handmade_oil_painting_reproduction_of_Ibn_Battuta_in_Egypt%2C_a_painting_by_Hippolyte_Leon_Benett..jpg/330px-Handmade_oil_painting_reproduction_of_Ibn_Battuta_in_Egypt%2C_a_painting_by_Hippolyte_Leon_Benett..jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Handmade_oil_painting_reproduction_of_Ibn_Battuta_in_Egypt%2C_a_painting_by_Hippolyte_Leon_Benett..jpg", text: 'Ibn Battuta was a fourteenth-century traveller from Tangier, in present-day Morocco. Over roughly three decades, his journeys took him across North Africa, the Middle East, parts of sub-Saharan Africa and Asia. His account, known as the Rihla, describes the people, cities and customs he encountered, although scholars debate some parts of the itinerary.' },
    { name: 'Sacagawea', title: 'Sacagawea', article: 'Sacagawea', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Detail_Lewis_%26_Clark_at_Three_Forks.jpg/330px-Detail_Lewis_%26_Clark_at_Three_Forks.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Detail_Lewis_%26_Clark_at_Three_Forks.jpg", text: 'Sacagawea was a Lemhi Shoshone woman who accompanied the Lewis and Clark expedition in 1805–1806. Travelling with her infant son, she helped with interpretation and contacts with Indigenous communities. Her knowledge and presence contributed to the expedition as it crossed western North America towards the Pacific.' },
    { name: 'Cook', title: 'James Cook', article: 'James_Cook', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Captainjamescookportrait.jpg/330px-Captainjamescookportrait.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Captainjamescookportrait.jpg", text: 'James Cook was a British naval captain and cartographer who led three major Pacific voyages in the eighteenth century. His crews charted coastlines including New Zealand and eastern Australia and travelled into Antarctic waters. These expeditions expanded European geographic knowledge and formed part of a colonial expansion with lasting consequences for Indigenous peoples.' },
    { name: 'Amundsen', title: 'Roald Amundsen', article: 'Roald_Amundsen', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Amundsen_in_fur_skins.jpg/330px-Amundsen_in_fur_skins.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:Amundsen_in_fur_skins.jpg", text: 'Roald Amundsen was a Norwegian polar explorer. He led the first expedition to navigate the Northwest Passage and, in December 1911, the first team to reach the South Pole. His expeditions relied on careful preparation and experience with polar travel, including skills learned from Inuit communities.' },
    { name: 'Gertrude Bell', title: 'Gertrude Bell', article: 'Gertrude_Bell', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/BellK_218_Gertrude_Bell_in_Iraq_in_1909_age_41.jpg/330px-BellK_218_Gertrude_Bell_in_Iraq_in_1909_age_41.jpg", imageSource: "https://commons.wikimedia.org/wiki/File:BellK_218_Gertrude_Bell_in_Iraq_in_1909_age_41.jpg", text: 'Gertrude Bell was a British traveller, writer and archaeologist who travelled extensively in the Middle East. She documented archaeological sites and worked in British administration after the First World War, helping shape the formation of modern Iraq. She also helped establish the Iraq Museum in Baghdad.' }
  ],
  open(index, opener) {
    const explorer = this.catalogue[index];
    if (!explorer) return;
    const dialog = document.getElementById('explorerDialog');
    document.getElementById('explorerTitle').textContent = explorer.title;
    document.getElementById('explorerBiography').textContent = explorer.text;
    document.getElementById('explorerWikipedia').href = `https://en.wikipedia.org/wiki/${explorer.article}`;
    const figure = document.getElementById('explorerFigure');
    const image = document.getElementById('explorerImage');
    const source = document.getElementById('explorerImageSource');
    const license = document.getElementById('explorerImageLicense');
    if (figure && image && source) {
      figure.classList.add('hidden');
      image.onload = () => figure.classList.remove('hidden');
      image.onerror = () => figure.classList.add('hidden');
      image.alt = `Wikipedia image of ${explorer.title}`;
      image.src = explorer.image;
      source.href = explorer.imageSource;
      if (license) {
        license.classList.toggle('hidden', !explorer.imageLicenseUrl);
        license.href = explorer.imageLicenseUrl || explorer.imageSource;
        license.textContent = explorer.imageLicense || '';
      }
      source.textContent = `${explorer.imageCredit || 'Wikimedia Commons'} · Image source and credits ↗`;
    }
    this.opener = opener;
    if (!dialog.open) dialog.showModal();
  },
  close() {
    const dialog = document.getElementById('explorerDialog');
    if (dialog?.open) dialog.close();
  }
};
