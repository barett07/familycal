const SUPABASE_URL = 'https://oqyjixphmdrhcmomskth.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qqov-1r2kMV5FXSp23_JCg_M8X8_uc9';
const FC_AUTH_URL  = `${SUPABASE_URL}/functions/v1/fc-auth`;
const FC_WRITE_URL = `${SUPABASE_URL}/functions/v1/fc-write`;
const FC_RESOLVE_URL = `${SUPABASE_URL}/functions/v1/fc-resolve-place`;

const TYPE_CONFIG = {
  '醫療回診': { color: '#64D2FF', bg: 'rgba(100,210,255,0.15)' },
  '家庭出遊': { color: '#30D158', bg: 'rgba(48,209,88,0.15)'   },
  '聚會/聚餐': { color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)'  },
  '考試':     { color: '#FF453A', bg: 'rgba(255,69,58,0.15)'   },
  '雜務':     { color: '#98989D', bg: 'rgba(152,152,157,0.15)' },
};
const TYPES = Object.keys(TYPE_CONFIG);

const CAT_CONFIG = {
  '飯/麵': '🍚', '早午餐': '🍳', '火鍋': '🍲', '義式': '🍝', '中式': '🥟',
  '日式': '🍣', '漢堡': '🍔', '牛排': '🥩', '拉麵': '🍜', '咖哩': '🍛',
  '咖啡': '☕', '甜點': '🍰', '小吃': '🍢',
};
const CATS = Object.keys(CAT_CONFIG);
