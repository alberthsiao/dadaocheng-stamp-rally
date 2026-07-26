/**
 * 「璀璨煙火・時光拼圖」活動店家資料
 * 資料來源：台北圓環太平永樂町商圈文創協會 活動 DM（115.7.25 – 115.8.14）
 *
 * 每筆欄位：
 *   id     店家編號（1–70，對應 DM 集章格）
 *   color  顏色分組 key
 *   name   店名
 *   sub    副標／英文名／分店名（可省略）
 *   street 所在街道（路線模式分組用）
 *   no     門牌主號（路線模式排序用，同街道由小到大＝順著走）
 *   addr   完整地址（不含縣市）
 *   place  額外位置說明，如永樂市場攤位（可省略）
 *   lat/lon 座標，取自 OpenStreetMap 門牌點（68 家對到實際門牌）
 *   approx true 表示該門牌在 OSM 不存在，改由同側相鄰門牌線性內插（66、67 兩家，誤差約 10 公尺內）
 */

/** hex：色塊主色；ink：色塊當底時的文字色（黃色偏亮，需配深色字） */
const COLORS = [
  { key: 'red', label: '紅', hex: '#d2413c', ink: '#fff' },
  { key: 'orange', label: '橙', hex: '#e07b2a', ink: '#fff' },
  { key: 'yellow', label: '黃', hex: '#d9a91b', ink: '#2c2105' },
  { key: 'green', label: '綠', hex: '#4f9b5a', ink: '#fff' },
  { key: 'blue', label: '藍', hex: '#2e7bb5', ink: '#fff' },
  { key: 'indigo', label: '靛', hex: '#4152a0', ink: '#fff' },
  { key: 'purple', label: '紫', hex: '#7a4e9e', ink: '#fff' },
];

/** 街道由「迪化街主軸」往外排，路線模式依此順序呈現 */
const STREET_ORDER = [
  '迪化街一段',
  '民樂街',
  '延平北路二段',
  '西寧北路',
  '環河北路一段',
  '貴德街',
  '重慶北路二段',
  '南京西路',
  '民生西路',
  '永昌街',
  '歸綏街',
  '涼州街',
  '安西街',
];

const SHOPS = [
  // ── 紅 01–10 ──────────────────────────────────────────────
  { id: 1, color: 'red', name: '純真豆花', street: '民樂街', no: 43, addr: '民樂街43號', lat: 25.05471, lon: 121.51106 },
  { id: 2, color: 'red', name: 'TERESA#3寵物精品', street: '延平北路二段', no: 60, addr: '延平北路二段60巷5號', lat: 25.05547, lon: 121.51139 },
  { id: 3, color: 'red', name: '沐溫頌缽', street: '迪化街一段', no: 18, addr: '迪化街一段18號', lat: 25.05424, lon: 121.5101 },
  { id: 4, color: 'red', name: '老桂坊', street: '迪化街一段', no: 46, addr: '迪化街一段46巷12號', lat: 25.05496, lon: 121.50968 },
  { id: 5, color: 'red', name: '永樂台南土魟魚羹', street: '民樂街', no: 1, addr: '民樂街1號', lat: 25.05435, lon: 121.51028 },
  { id: 6, color: 'red', name: '芙稻菓室', street: '延平北路二段', no: 25, addr: '延平北路二段25號', lat: 25.05468, lon: 121.51184 },
  { id: 7, color: 'red', name: '芯森景制所', sub: 'FOASIS', street: '迪化街一段', no: 149, addr: '迪化街一段149號3樓', lat: 25.05813, lon: 121.50979 },
  { id: 8, color: 'red', name: '夜奔文創', sub: '大稻埕旗艦店', street: '迪化街一段', no: 237, addr: '迪化街一段237號', lat: 25.06018, lon: 121.50941 },
  { id: 9, color: 'red', name: '喝喝', sub: 'HEHE BOOKSTORE & WINE', street: '貴德街', no: 51, addr: '貴德街51號2樓', lat: 25.05511, lon: 121.50841 },
  { id: 10, color: 'red', name: '思美妲咖啡店', street: '西寧北路', no: 29, addr: '西寧北路29號', lat: 25.05309, lon: 121.50879 },

  // ── 橙 11–20 ──────────────────────────────────────────────
  { id: 11, color: 'orange', name: '姚德和', street: '民樂街', no: 57, addr: '民樂街57號', lat: 25.05509, lon: 121.51103 },
  { id: 12, color: 'orange', name: '韋億興業', street: '延平北路二段', no: 60, addr: '延平北路二段60巷19號', lat: 25.05544, lon: 121.51107 },
  { id: 13, color: 'orange', name: '源慶鮮蚵', street: '迪化街一段', no: 28, addr: '迪化街一段28號', lat: 25.05447, lon: 121.51009 },
  { id: 14, color: 'orange', name: '埕米峰x御華生', street: '迪化街一段', no: 69, addr: '迪化街一段69號', lat: 25.05601, lon: 121.51002 },
  { id: 15, color: 'orange', name: '岩究所攀岩館', street: '迪化街一段', no: 251, addr: '迪化街一段251號2樓', lat: 25.06073, lon: 121.50937 },
  { id: 16, color: 'orange', name: '燕窩女神', street: '延平北路二段', no: 34, addr: '延平北路二段34號', lat: 25.05484, lon: 121.51164 },
  { id: 17, color: 'orange', name: '大華行／竹木造咖', street: '迪化街一段', no: 161, addr: '迪化街一段161號', lat: 25.05863, lon: 121.5097 },
  { id: 18, color: 'orange', name: '預見日好', street: '迪化街一段', no: 282, addr: '迪化街一段282號', lat: 25.06102, lon: 121.50922 },
  { id: 19, color: 'orange', name: '琯樂堂藝文空間', street: '環河北路一段', no: 111, addr: '環河北路一段111號', lat: 25.05391, lon: 121.50766 },
  { id: 20, color: 'orange', name: '春天家', street: '西寧北路', no: 55, addr: '西寧北路55號', lat: 25.05442, lon: 121.50895 },

  // ── 黃 21–30 ──────────────────────────────────────────────
  { id: 21, color: 'yellow', name: '正發青草舖', street: '民樂街', no: 63, addr: '民樂街63號前', lat: 25.05526, lon: 121.51101 },
  { id: 22, color: 'yellow', name: '一成亮記', street: '延平北路二段', no: 60, addr: '延平北路二段60巷20號', lat: 25.05537, lon: 121.51107 },
  { id: 23, color: 'yellow', name: '溫蒂舞衣材料店', street: '迪化街一段', no: 21, addr: '迪化街一段21號', place: '永樂市場1樓1200室', lat: 25.05498, lon: 121.51059 },
  { id: 24, color: 'yellow', name: '餅乾打人', street: '迪化街一段', no: 72, addr: '迪化街一段72巷14號', lat: 25.05557, lon: 121.50956 },
  { id: 25, color: 'yellow', name: '永樂蔥油餅', street: '民樂街', no: 4, addr: '民樂街4號', lat: 25.05572, lon: 121.51085 },
  { id: 26, color: 'yellow', name: '順季服裝材料行', street: '延平北路二段', no: 36, addr: '延平北路二段36巷22號', lat: 25.05481, lon: 121.51107 },
  { id: 27, color: 'yellow', name: '曾拌麵', street: '迪化街一段', no: 171, addr: '迪化街一段171號', lat: 25.05871, lon: 121.50962 },
  { id: 28, color: 'yellow', name: '李亭香', street: '迪化街一段', no: 309, addr: '迪化街一段309號', lat: 25.06211, lon: 121.50929 },
  { id: 29, color: 'yellow', name: '蔡記古早味蚵嗲', street: '民生西路', no: 362, addr: '民生西路362巷40號', lat: 25.05564, lon: 121.51062 },
  { id: 30, color: 'yellow', name: '永續百貨', street: '西寧北路', no: 65, addr: '西寧北路65-67號', lat: 25.05474, lon: 121.50899 },

  // ── 綠 31–40 ──────────────────────────────────────────────
  { id: 31, color: 'green', name: '狸小籠', street: '延平北路二段', no: 60, addr: '延平北路二段60巷21號', lat: 25.05543, lon: 121.51102 },
  { id: 32, color: 'green', name: '老媽麵店', street: '延平北路二段', no: 62, addr: '延平北路二段62號', lat: 25.05552, lon: 121.51158 },
  { id: 33, color: 'green', name: '丸隆日料', street: '迪化街一段', no: 21, addr: '迪化街一段21號', place: '永樂市場1樓1418攤', lat: 25.05498, lon: 121.51059 },
  { id: 34, color: 'green', name: '小蒔日咖哩', street: '迪化街一段', no: 72, addr: '迪化街一段72巷23號', lat: 25.05501, lon: 121.50921 },
  { id: 35, color: 'green', name: '江牛樓', street: '民樂街', no: 6, addr: '民樂街6號', lat: 25.05576, lon: 121.51085 },
  { id: 36, color: 'green', name: '有記名茶', street: '重慶北路二段', no: 64, addr: '重慶北路二段64巷26號', lat: 25.05571, lon: 121.5131 },
  { id: 37, color: 'green', name: '媽媽家', street: '迪化街一段', no: 180, addr: '迪化街一段180號', lat: 25.05846, lon: 121.50953 },
  { id: 38, color: 'green', name: '玉門關以西', street: '迪化街一段', no: 316, addr: '迪化街一段316號', lat: 25.06182, lon: 121.50915 },
  { id: 39, color: 'green', name: '赤埕（日）／SAY YO BAR（夜）', street: '永昌街', no: 1, addr: '永昌街1號', lat: 25.05562, lon: 121.51084 },
  { id: 40, color: 'green', name: '台南古早味虱目魚', street: '南京西路', no: 233, addr: '南京西路233巷4號', lat: 25.05403, lon: 121.51045 },

  // ── 藍 41–50 ──────────────────────────────────────────────
  { id: 41, color: 'blue', name: '維德時尚布坊', street: '民樂街', no: 73, addr: '民樂街73之2號', lat: 25.05579, lon: 121.51098 },
  { id: 42, color: 'blue', name: '十字軒', street: '延平北路二段', no: 68, addr: '延平北路二段68號', lat: 25.05564, lon: 121.51157 },
  { id: 43, color: 'blue', name: '漁匠甘霖', street: '迪化街一段', no: 21, addr: '迪化街一段21號', place: '永樂市場1樓1419攤', lat: 25.05498, lon: 121.51059 },
  { id: 44, color: 'blue', name: '和億蔘茸有限公司', street: '迪化街一段', no: 90, addr: '迪化街一段90號1樓', lat: 25.05605, lon: 121.5099 },
  { id: 45, color: 'blue', name: '滋生青草店', street: '民樂街', no: 8, addr: '民樂街8號', lat: 25.05582, lon: 121.51085 },
  { id: 46, color: 'blue', name: '台湾日和', street: '延平北路二段', no: 41, addr: '延平北路二段41號', lat: 25.05504, lon: 121.51182 },
  { id: 47, color: 'blue', name: '樂芙莉LOVELY', street: '迪化街一段', no: 186, addr: '迪化街一段186號', lat: 25.05941, lon: 121.50935 },
  { id: 48, color: 'blue', name: '有所花植', sub: 'SUO_FLOWER', street: '迪化街一段', no: 328, addr: '迪化街一段328號2樓', lat: 25.06209, lon: 121.50915 },
  { id: 49, color: 'blue', name: '天亮茶空間', street: '永昌街', no: 7, addr: '永昌街7號', lat: 25.05559, lon: 121.51076 },
  { id: 50, color: 'blue', name: '台北往事咖啡館', sub: '迪化店', street: '南京西路', no: 233, addr: '南京西路233巷9號', lat: 25.05509, lon: 121.51027 },

  // ── 靛 51–60 ──────────────────────────────────────────────
  { id: 51, color: 'indigo', name: '金泉人造花', street: '民樂街', no: 75, addr: '民樂街75號', lat: 25.05587, lon: 121.51098 },
  { id: 52, color: 'indigo', name: '蔥穎牛軋餅', street: '延平北路二段', no: 247, addr: '延平北路二段247巷25號', lat: 25.06241, lon: 121.51324 },
  { id: 53, color: 'indigo', name: '林士傑會長', sub: '傑威布行', street: '迪化街一段', no: 21, addr: '迪化街一段21號', place: '永樂市場2樓2046室', lat: 25.05498, lon: 121.51059 },
  { id: 54, color: 'indigo', name: '唐舖子', street: '迪化街一段', no: 141, addr: '迪化街一段141號', lat: 25.05789, lon: 121.50977 },
  { id: 55, color: 'indigo', name: '幹嘛', street: '民樂街', no: 18, addr: '民樂街18號', lat: 25.05602, lon: 121.51078 },
  { id: 56, color: 'indigo', name: '林三益', street: '重慶北路二段', no: 58, addr: '重慶北路二段58號', lat: 25.05578, lon: 121.51383 },
  { id: 57, color: 'indigo', name: '五方食藏', street: '迪化街一段', no: 202, addr: '迪化街一段202號', lat: 25.05899, lon: 121.50945 },
  { id: 58, color: 'indigo', name: '食連動', street: '迪化街一段', no: 337, addr: '迪化街一段337號', lat: 25.0627, lon: 121.50931 },
  { id: 59, color: 'indigo', name: '永昌傳統豆花店', street: '永昌街', no: 9, addr: '永昌街9號', lat: 25.05558, lon: 121.51061 },
  { id: 60, color: 'indigo', name: '小花園', street: '南京西路', no: 237, addr: '南京西路237號', lat: 25.05381, lon: 121.51014 },

  // ── 紫 61–70 ──────────────────────────────────────────────
  { id: 61, color: 'purple', name: 'Vescor 偉詩蔻', street: '民樂街', no: 121, addr: '民樂街121號', lat: 25.05759, lon: 121.51066 },
  { id: 62, color: 'purple', name: '劉恆裕行', street: '民生西路', no: 342, addr: '民生西路342號', lat: 25.05685, lon: 121.51095 },
  { id: 63, color: 'purple', name: '台灣布可吧咖啡', sub: '原小樽', street: '迪化街一段', no: 34, addr: '迪化街一段34號', lat: 25.05466, lon: 121.51001 },
  { id: 64, color: 'purple', name: '勝益', street: '迪化街一段', no: 146, addr: '迪化街一段146號', lat: 25.0576, lon: 121.50967 },
  { id: 65, color: 'purple', name: 'EWF VINTAGE', street: '民樂街', no: 28, addr: '民樂街28號', lat: 25.05631, lon: 121.51082 },
  { id: 66, color: 'purple', name: '勝光行', street: '歸綏街', no: 238, addr: '歸綏街238號', lat: 25.05805, lon: 121.50919, approx: true },
  { id: 67, color: 'purple', name: '導演的豆花店', street: '迪化街一段', no: 224, addr: '迪化街一段224巷24號', lat: 25.05943, lon: 121.50865, approx: true },
  { id: 68, color: 'purple', name: '初二手烘咖啡館', street: '涼州街', no: 106, addr: '涼州街106號2樓', lat: 25.0605, lon: 121.50982 },
  { id: 69, color: 'purple', name: '囍笑順', street: '安西街', no: 170, addr: '安西街170號', lat: 25.06285, lon: 121.50978 },
  { id: 70, color: 'purple', name: '飾飾戴戴', street: '南京西路', no: 239, addr: '南京西路239巷3號3樓', lat: 25.05372, lon: 121.50994 },
];

/** 活動資訊 */
const EVENT = {
  title: '璀璨煙火・時光拼圖',
  subtitle: '永樂尋蹤｜台北圓環太平永樂町商圈文創協會',
  start: '2026-07-25',
  end: '2026-08-14',
  dateLabel: '115年7月25日 – 8月14日',
  drawDate: '2026-08-15',
  city: '臺北市大同區',
  gacha: {
    place: '臺北市大同區民樂街71之1號旁',
    hours: '平日11:00-18:30 假日11:00~20:00（週一公休）',
  },
  /** 主辦單位提供的官方連結 */
  links: {
    video: 'https://www.instagram.com/reel/DbMwjHBv7KQ/',
    map: 'https://maps.app.goo.gl/XGdmG53BxwRNiV4v5',
  },
  /** 活動 DM 正面的宣傳標語（原文） */
  tagline: '七種顏色各集一家即可扭蛋一次最多三次，集滿70家抽大獎',
  /** DM 背面「活動規則」九條，原文照錄，不改寫 */
  rules: [
    '本次活動期間為7月25日至8月14日，活動合作店家共70家，依紅、橙、黃、綠、藍、靛、紫七種顏色分類，每種顏色各10家。',
    '參加者於活動店家完成消費後，可獲得該店家印章一枚；每家店章均有專屬編號，須蓋於DM上相同編號的集章格內，編號不符者視為無效。',
    '每次彩虹任務須於七種顏色區域中各集滿1枚有效印章，共7枚印章，即完成1次彩虹任務；完成第2次、第3次時，各色須再取得不同編號之店家印章，不得重複計算。',
    '每完成1次彩虹任務，可至指定活動地點參加1次夾扭蛋機活動；每張DM最多完成3次彩虹任務，並參加3次夾扭蛋活動。',
    '活動地點：臺北市大同區民樂街71之1號旁。平日11:00-18:30 假日11:00~20:00（週一公休）',
    '參加者應於DM填寫姓名及手機號碼，作為當次活動參加及重複資格判斷依據。',
    '每人每次限持1張DM參加，不得同時持多張DM重複兌換或代替他人參加；惟隔日重新領取DM再參加，則不在此限。',
    '集滿70家活動店家有效印章者，可投入摸彩箱參加8月15日直播大獎摸彩；若發現同一參加者重複投入或重複中獎，僅保留1份資格，其餘資格無效，並抽出下一位遞補。',
    '主辦單位保留活動規則解釋、參加資格審查及活動內容調整之權利。',
  ],
  organizer: '台北圓環太平永樂町商圈文創協會',
  advisor: '經濟部商業發展署',
};
