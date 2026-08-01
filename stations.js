// =====================================================================
// 中国地方タイド — 観測点定義
//
// jmaAnchor:false = 気象庁の公式潮位観測点。その地点の推算値をそのまま使う。
// jmaAnchor:true  = 公式観測点がないため最寄り観測点(jma)の値を参照する近似地点。
//
// 座標の出典:
//   公式観測点 … 気象庁 潮位表 各観測点ページ(緯度経度は分単位で掲載)
//   近似地点   … OpenStreetMap Nominatim
//                (県名一致・中国地方bbox内・標高20m以下 の3条件で検証済み)
//
// damp/dz について:
//   広島湾周辺の9地点は既存アプリで調整済みの係数を踏襲している。
//   それ以外の近似地点は実測による検証ができないため、根拠のない係数を
//   与えず damp=1.00 / dz=0 とし、最寄り観測点の値をそのまま表示する。
//   この扱いは画面の注記でも明示する。
//
// model について:
//   調和定数モデル(HC_HIROSHIMA)は広島(宇品)の公式調和定数であり、
//   広島湾以外に流用すると大きく外れる。実際、干満差は瀬戸内が約370cm、
//   日本海側の境は約42cmで9倍近い差がある。そのため model:"hiroshima" は
//   広島湾(Q8/Q9)系の地点のみとし、他は通信失敗時にフォールバックせず
//   「データなし」を明示する。
// =====================================================================

const PREFS = [
  { id: 'tottori', name: '鳥取県' },
  { id: 'shimane', name: '島根県' },
  { id: 'okayama', name: '岡山県' },
  { id: 'hiroshima', name: '広島県' },
  { id: 'yamaguchi', name: '山口県' },
];

const TIDE_STATIONS = [
  // ---------- 鳥取県 ----------
  { id:'tajiri', name:'田後', kana:'たじり', lat:35.6, lon:134.3167, pref:'tottori', sea:'japan',
    jma:'ZE', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'sakai', name:'境', kana:'さかい', lat:35.55, lon:133.25, pref:'tottori', sea:'japan',
    jma:'SK', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'tottori', name:'鳥取(賀露)', kana:'とっとり', lat:35.5284, lon:134.1791, pref:'tottori', sea:'japan',
    jma:'ZE', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'yurihama', name:'湯梨浜(泊)', kana:'ゆりはま', lat:35.5093, lon:133.9364, pref:'tottori', sea:'japan',
    jma:'ZE', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'yonago', name:'米子(皆生)', kana:'よなご', lat:35.4322, lon:133.3206, pref:'tottori', sea:'japan',
    jma:'SK', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  // ---------- 島根県 ----------
  { id:'saigo', name:'西郷', kana:'さいごう', lat:36.2, lon:133.3333, pref:'shimane', sea:'japan',
    jma:'SA', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hamada', name:'浜田', kana:'はまだ', lat:34.9, lon:132.0667, pref:'shimane', sea:'japan',
    jma:'HA', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'tsuma', name:'隠岐(都万)', kana:'つま', lat:36.1289, lon:133.2589, pref:'shimane', sea:'japan',
    jma:'SA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'mihonoseki', name:'松江(美保関)', kana:'みほのせき', lat:35.5328, lon:133.1842, pref:'shimane', sea:'japan',
    jma:'SK', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'taisha', name:'出雲(大社)', kana:'たいしゃ', lat:35.4319, lon:132.6401, pref:'shimane', sea:'japan',
    jma:'HA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'nima', name:'大田(仁摩)', kana:'にま', lat:35.1522, lon:132.4082, pref:'shimane', sea:'japan',
    jma:'HA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'gotsu', name:'江津', kana:'ごうつ', lat:35.014, lon:132.2185, pref:'shimane', sea:'japan',
    jma:'HA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'masuda', name:'益田', kana:'ますだ', lat:34.6906, lon:131.8332, pref:'shimane', sea:'japan',
    jma:'HA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  // ---------- 岡山県 ----------
  { id:'sanban', name:'三蟠', kana:'さんばん', lat:34.6, lon:133.9833, pref:'okayama', sea:'seto',
    jma:'SB', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'mizushima', name:'水島', kana:'みずしま', lat:34.5333, lon:133.7333, pref:'okayama', sea:'seto',
    jma:'MM', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'otsushima', name:'乙島', kana:'おとしま', lat:34.5, lon:133.6833, pref:'okayama', sea:'seto',
    jma:'LG', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'uno', name:'宇野', kana:'うの', lat:34.4833, lon:133.95, pref:'okayama', sea:'seto',
    jma:'UN', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hinase', name:'備前(日生)', kana:'ひなせ', lat:34.7312, lon:134.2692, pref:'okayama', sea:'seto',
    jma:'SB', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'ushimado', name:'瀬戸内(牛窓)', kana:'うしまど', lat:34.6814, lon:134.1409, pref:'okayama', sea:'seto',
    jma:'SB', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'kasaoka', name:'笠岡', kana:'かさおか', lat:34.5049, lon:133.5052, pref:'okayama', sea:'seto',
    jma:'LG', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'yorishima', name:'浅口(寄島)', kana:'よりしま', lat:34.4889, lon:133.5919, pref:'okayama', sea:'seto',
    jma:'LG', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'kojima', name:'倉敷(児島)', kana:'こじま', lat:34.4673, lon:133.8058, pref:'okayama', sea:'seto',
    jma:'MM', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  // ---------- 広島県 ----------
  { id:'itozaki', name:'糸崎(三原)', kana:'いとざき/みはら', lat:34.4, lon:133.0833, pref:'hiroshima', sea:'seto',
    jma:'IZ', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hiroshima', name:'広島', kana:'ひろしま', lat:34.35, lon:132.4667, pref:'hiroshima', sea:'seto',
    jma:'Q8', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:'hiroshima' },
  { id:'takehara', name:'竹原', kana:'たけはら', lat:34.3333, lon:132.9167, pref:'hiroshima', sea:'seto',
    jma:'TH', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'kure', name:'呉', kana:'くれ', lat:34.2333, lon:132.55, pref:'hiroshima', sea:'seto',
    jma:'Q9', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:'hiroshima' },
  { id:'onomichi', name:'尾道', kana:'おのみち', lat:34.4045, lon:133.198, pref:'hiroshima', sea:'seto',
    jma:'IZ', jmaAnchor:true, damp:1.12, dz:-8, dphase:0.45, model:null },
  { id:'fukuyama', name:'福山(鞆)', kana:'とものうら', lat:34.3814, lon:133.3818, pref:'hiroshima', sea:'seto',
    jma:'IZ', jmaAnchor:true, damp:1.15, dz:-10, dphase:0.50, model:null },
  { id:'hatsukaichi', name:'廿日市', kana:'はつかいち', lat:34.3487, lon:132.3315, pref:'hiroshima', sea:'seto',
    jma:'Q8', jmaAnchor:true, damp:1.03, dz:8, dphase:-0.05, model:'hiroshima' },
  { id:'ninoshima', name:'似島', kana:'にのしま', lat:34.3133, lon:132.4333, pref:'hiroshima', sea:'seto',
    jma:'Q8', jmaAnchor:true, damp:1.00, dz:2, dphase:0.00, model:'hiroshima' },
  { id:'miyajima', name:'宮島(厳島)', kana:'みやじま', lat:34.2965, lon:132.319, pref:'hiroshima', sea:'seto',
    jma:'Q8', jmaAnchor:true, damp:0.98, dz:5, dphase:-0.10, model:'hiroshima' },
  { id:'etajima', name:'江田島', kana:'えたじま', lat:34.2477, lon:132.493, pref:'hiroshima', sea:'seto',
    jma:'Q9', jmaAnchor:true, damp:1.00, dz:0, dphase:0.05, model:'hiroshima' },
  { id:'otake', name:'大竹', kana:'おおたけ', lat:34.2367, lon:132.218, pref:'hiroshima', sea:'seto',
    jma:'Q8', jmaAnchor:true, damp:1.05, dz:10, dphase:-0.15, model:'hiroshima' },
  { id:'ondo', name:'音戸', kana:'おんど', lat:34.1974, lon:132.5385, pref:'hiroshima', sea:'seto',
    jma:'Q9', jmaAnchor:true, damp:1.08, dz:-3, dphase:0.15, model:'hiroshima' },
  // ---------- 山口県 ----------
  { id:'susa', name:'須佐', kana:'すさ', lat:34.6333, lon:131.6, pref:'yamaguchi', sea:'japan',
    jma:'ZK', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hagi', name:'萩', kana:'はぎ', lat:34.4333, lon:131.4167, pref:'yamaguchi', sea:'japan',
    jma:'K5', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'tokuyama', name:'徳山', kana:'とくやま', lat:34.0333, lon:131.8, pref:'yamaguchi', sea:'seto',
    jma:'QA', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'mitajiri', name:'三田尻', kana:'みたじり', lat:34.0333, lon:131.5833, pref:'yamaguchi', sea:'seto',
    jma:'J9', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'chofu', name:'長府', kana:'ちょうふ', lat:34.0167, lon:131.0, pref:'yamaguchi', sea:'seto',
    jma:'CF', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hayatomo', name:'南風泊', kana:'はえどまり', lat:33.95, lon:130.8833, pref:'yamaguchi', sea:'seto',
    jma:'HR', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'ube', name:'宇部', kana:'うべ', lat:33.9333, lon:131.25, pref:'yamaguchi', sea:'seto',
    jma:'WH', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'shimonoseki', name:'下関', kana:'しものせき', lat:33.9333, lon:130.9333, pref:'yamaguchi', sea:'seto',
    jma:'DS', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'tanokubi', name:'田ノ首', kana:'たのくび', lat:33.9167, lon:130.9167, pref:'yamaguchi', sea:'seto',
    jma:'TI', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'oyamanohana', name:'大山の鼻', kana:'おおやまのはな', lat:33.9167, lon:130.9, pref:'yamaguchi', sea:'seto',
    jma:'OH', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'senzaki', name:'長門(仙崎)', kana:'せんざき', lat:34.3909, lon:131.1968, pref:'yamaguchi', sea:'japan',
    jma:'K5', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'tsunoshima', name:'下関(角島)', kana:'つのしま', lat:34.3524, lon:130.8872, pref:'yamaguchi', sea:'japan',
    jma:'K5', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'iwakuni', name:'岩国', kana:'いわくに', lat:34.1905, lon:132.2341, pref:'yamaguchi', sea:'seto',
    jma:'QA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'aio', name:'山口(秋穂)', kana:'あいお', lat:34.0308, lon:131.4691, pref:'yamaguchi', sea:'seto',
    jma:'J9', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'yanai', name:'柳井', kana:'やない', lat:33.9583, lon:132.1343, pref:'yamaguchi', sea:'seto',
    jma:'QA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'hikari', name:'光', kana:'ひかり', lat:33.9303, lon:131.9729, pref:'yamaguchi', sea:'seto',
    jma:'QA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
  { id:'kaminoseki', name:'上関', kana:'かみのせき', lat:33.8236, lon:132.112, pref:'yamaguchi', sea:'seto',
    jma:'QA', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },
];

// 気象庁観測点コード → 表示名(注記で「どの観測点を参照したか」を出すため)
const JMA_STN_NAME = {
  CF:'長府', DS:'下関', HA:'浜田', HR:'南風泊', IZ:'糸崎(三原)', J9:'三田尻', K5:'萩', LG:'乙島', MM:'水島', OH:'大山の鼻', Q8:'広島', Q9:'呉', QA:'徳山', SA:'西郷', SB:'三蟠', SK:'境', TH:'竹原', TI:'田ノ首', UN:'宇野', WH:'宇部', ZE:'田後', ZK:'須佐',
};
