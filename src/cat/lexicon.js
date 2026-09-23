/**
 * Cat lexicon: the vocabulary CATNIP uses to decide whether a token is a cat.
 *
 * Everything here is data, kept apart from the scoring logic in detector.js so
 * the vocabulary can grow without touching the algorithm.
 */

/** Words that mean "cat" (or a specific famous cat) across languages and memes. */
export const CAT_TERMS = Object.freeze([
  // English + meme
  'cat', 'cats', 'kitty', 'kitten', 'kittens', 'kitties', 'meow', 'mew', 'purr',
  'feline', 'tabby', 'tomcat', 'paw', 'paws', 'whisker', 'whiskers', 'nyan',
  'popcat', 'catto', 'kat', 'kitteh', 'mrrp', 'nya', 'pspsps', 'purrr',
  // Named cat coins / famous internet cats
  'garfield', 'grumpycat', 'keyboardcat', 'longcat', 'maxwell', 'oiia',
  'schrodinger', 'bingus', 'floppa', 'jinx', 'nala', 'sphynx',
  // Other languages
  'neko', 'nyanko', 'gato', 'gata', 'gatto', 'gatinho', 'chat', 'chatte',
  'katze', 'kotik', 'kucing', 'meo', 'mao', 'miao', 'mieze', 'katt', 'kissa',
  'macska', 'kedi', 'qitta', 'billi', 'pusa', 'pusheen', 'koshka', 'kotek',
  // Breeds
  'persian', 'siamese', 'ragdoll', 'munchkin', 'bengal', 'calico',
  // Wild felines — a cat is a cat
  'bobcat', 'wildcat', 'lynx', 'caracal', 'cheetah', 'leopard', 'panther',
  'cougar', 'ocelot', 'serval', 'jaguar', 'puma', 'tiger', 'lion', 'lioness',
]);

/** Terms that are strong on their own (a single hit is enough to call it a cat). */
export const STRONG_TERMS = Object.freeze(new Set([
  'cat', 'cats', 'kitty', 'kitten', 'kittens', 'kitties', 'meow', 'neko',
  'popcat', 'feline', 'nyan', 'catto', 'kitteh', 'gato', 'kucing', 'pusheen',
  'floppa', 'bingus', 'mew', 'miao', 'purr',
]));

/** Cat emoji and pictographs. */
export const CAT_EMOJI = Object.freeze([
  '\u{1F431}', // 🐱
  '\u{1F408}', // 🐈
  '\u{1F63A}', // 😺
  '\u{1F638}', // 😸
  '\u{1F639}', // 😹
  '\u{1F63B}', // 😻
  '\u{1F63C}', // 😼
  '\u{1F63D}', // 😽
  '\u{1F640}', // 🙀
  '\u{1F63F}', // 😿
  '\u{1F63E}', // 😾
  '\u{1F43E}', // 🐾
  '\u{1F63B}',
]);

/**
 * Words that merely CONTAIN a cat term but are not cats. Without this list a
 * naive substring match tags "Concatenate", "Catalyst" and "Duplicate" as cats.
 */
export const CONTAINER_TRAPS = Object.freeze(new Set([
  'concat', 'concatenate', 'concatenated', 'catalog', 'catalogue', 'catalyst',
  'catalysts', 'catalytic', 'category', 'categories', 'categorical', 'cattle',
  'catastrophe', 'catastrophic', 'catch', 'catcher', 'catching', 'catapult',
  'cathedral', 'catheter', 'cathode', 'catholic', 'caterpillar', 'catering',
  'cater', 'catwalk', 'duplicate', 'delicate', 'certificate', 'advocate',
  'allocate', 'indicate', 'dedicate', 'locate', 'educate', 'communicate',
  'vacation', 'application', 'education', 'scatter', 'scattered', 'decathlon',
  'vocation', 'multiplication', 'complicated', 'escalate', 'intricate',
  'chateau', 'chatter', 'chatbot', 'chatgpt', 'chatroom', 'katana', 'katakana',
  'maonomics', 'maoist', 'gatorade', 'gateway', 'gather', 'gatekeeper',
  'mewtwo', // Pokemon, not a cat coin — kept as a trap on purpose
]));

/**
 * Anti-signals. A token that screams DOG is not a cat even if "cat" appears in
 * the description ("the cat killer", "not a cat").
 */
export const ANTI_TERMS = Object.freeze([
  'dog', 'doge', 'dogecoin', 'shib', 'shiba', 'inu', 'wif', 'bonk', 'puppy',
  'corgi', 'husky', 'pitbull', 'labrador', 'woof', 'bark', 'hound', 'pup',
  'frog', 'pepe', 'toad', 'penguin', 'pengu', 'moodeng', 'hippo', 'capybara',
  'monkey', 'ape', 'bird', 'duck', 'goose', 'hamster', 'rat', 'mouse',
]);

/** Leetspeak / homoglyph normalisation applied before matching. */
export const LEET_MAP = Object.freeze({
  '4': 'a', '@': 'a', 'à': 'a', 'á': 'a', 'ä': 'a',
  '3': 'e', 'é': 'e', 'è': 'e',
  '1': 'i', 'í': 'i',
  '0': 'o', 'ö': 'o', 'ó': 'o',
  '5': 's', '$': 's',
  '7': 't',
  'ü': 'u', 'ú': 'u',
});

/** Filler words that may sit next to a cat term in a compound ticker. */
export const COMPOUND_FILLERS = Object.freeze(new Set([
  'wif', 'hat', 'moon', 'baby', 'mega', 'giga', 'super', 'king', 'queen',
  'lord', 'sol', 'solana', 'pump', 'fun', 'coin', 'token', 'inu', 'ai',
  'agent', 'boss', 'daddy', 'mommy', 'space', 'astro', 'turbo', 'based',
  'fat', 'big', 'lil', 'little', 'tiny', 'the', 'my', 'your', 'first',
  'bob', 'wild', 'black', 'white', 'street', 'alley', 'cool', 'cyber',
  'ninja', 'pirate', 'ghost', 'robo', 'laser', 'chad', 'gigachad', 'hyper',
]));
