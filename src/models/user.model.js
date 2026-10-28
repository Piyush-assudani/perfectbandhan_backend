const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  pbId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  password: {
    type: String,
    default: ''
  },
  googleId: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['mobile', 'google'],
    default: 'mobile'
  },
  profileFor: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    required: true,
    index: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  caste: {
    type: String
  },
  sindhiType: {
    type: String,
    default: 'Sindhi Hindu'
  },
  dob: {
    type: Date
  },
  birthTime: {
    type: String,
    default: ''
  },
  birthPlace: {
    type: String,
    default: ''
  },
  height: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    index: true,
    default: ''
  },
  state: {
    type: String,
    default: ''
  },
  maritalStatus: {
    type: String,
    default: 'Never Married'
  },
  education: {
    type: String,
    default: ''
  },
  profession: {
    type: String,
    default: ''
  },
  professionSector: {
    type: String,
    default: 'Corporate Job'
  },
  company: {
    type: String,
    default: 'Self'
  },
  location: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  compatibilityScore: {
    type: Number,
    default: 80
  },
  initials: {
    type: String,
    default: ''
  },
  fathersOccupation: {
    type: String,
    default: ''
  },
  weight: {
    type: String,
    default: ''
  },
  fatherStatus: {
    type: String,
    default: 'Alive'
  },
  motherStatus: {
    type: String,
    default: 'Alive'
  },
  mothersOccupation: {
    type: String,
    default: ''
  },
  siblingsCount: {
    type: String,
    default: '0'
  },
  siblingsDetails: {
    type: String,
    default: ''
  },
  manglikStatus: {
    type: String,
    default: 'Not Manglik'
  },
  otherGrah: {
    type: String,
    default: ''
  },
  medicalFit: {
    type: String,
    default: 'Yes'
  },
  medicalIssue: {
    type: String,
    default: ''
  },
  liveWithFamily: {
    type: String,
    default: 'Yes'
  },
  liveWithWhom: {
    type: String,
    default: ''
  },
  aboutFamily: {
    type: String,
    default: ''
  },
  incomeBracket: {
    type: String,
    default: 'Not Specified'
  },
  gradientColors: {
    type: [String],
    default: ['#C2E9FB', '#A1C4FD']
  },
  uploadedPhotos: {
    type: [String],
    default: []
  },
  // --- New Advanced Fields ---
  monthlyIncome: {
    type: String,
    default: ''
  },
  yearlyIncome: {
    type: String,
    default: ''
  },
  district: {
    type: String,
    default: ''
  },
  properAddress: {
    type: String,
    default: ''
  },
  jobPost: {
    type: String,
    default: ''
  },
  ownHouse: {
    type: String,
    default: ''
  },
  housePhoto: {
    type: String,
    default: ''
  },
  surname: {
    type: String,
    default: ''
  },
  nukh: {
    type: String,
    default: ''
  },
  requirements: {
    type: String,
    default: ''
  },
  whatWeProvide: {
    type: String,
    default: ''
  },
  physicalDisability: {
    type: String,
    default: ''
  },
  complexion: {
    type: String,
    default: ''
  },
  whatsappNumber: {
    type: String,
    default: ''
  },
  whatsappPrivacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },
  whatsappRequests: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  whatsappApproved: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  chatStartsToday: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  chatResetDate: {
    type: Date,
    default: Date.now
  },
  chatConnections: {
    type: [String],
    default: []
  },
  lastResetMonth: {
    type: Number,
    default: new Date().getMonth()
  },
  // --- Profile Settings & Privacy ---
  familyType: {
    type: String,
    default: 'Nuclear'
  },
  cityOfOrigin: {
    type: String,
    default: ''
  },
  profileHidden: {
    type: Boolean,
    default: false
  },
  incomeHidden: {
    type: Boolean,
    default: false
  },
  photosVisibility: {
    type: String,
    default: 'All Matches'
  },
  // --- Premium Feature Counters ---
  connects: {
    type: Number,
    default: 5
  },
  superLikes: {
    type: Number,
    default: 2
  },
  // --- Partner Preferences ---
  astrologyInsight: {
    type: Object,
    default: null
  },
  partnerPreferences: {
    minAge: { type: Number, default: 22 },
    maxAge: { type: Number, default: 26 },
    minHeight: { type: String, default: "5'0\"" },
    maxHeight: { type: String, default: "5'10\"" },
    country: { type: String, default: 'India' },
    state: { type: String, default: 'Not set' },
    city: { type: String, default: 'Not set' },
    religion: { type: [String], default: ['Hindu'] },
    caste: { type: [String], default: [] },
    motherTongue: { type: [String], default: [] },
    manglikStatus: { type: [String], default: ['Non Manglik'] },
    education: { type: [String], default: [] },
    professionSector: { type: [String], default: [] },
    incomeRupees: { type: String, default: '0 and above' },
    incomeDollars: { type: String, default: '0 and above' }
  },
  hobbies: {
    type: [String],
    default: []
  },
  reportedBy: {
    type: [String],
    default: []
  },
  blockedBy: {
    type: [String],
    default: []
  },
  blockedUsers: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  verificationOtp: {
    type: String
  },
  otpExpiresAt: {
    type: Date
  },
  fcmToken: {
    type: String,
    default: ''
  },
  profileVisits: { type: Number, default: 0 },
  contactViews: { type: Number, default: 0 },
  visitedBy: { type: [String], default: [] },
  contactViewedBy: { type: [String], default: [] },

  // --- Anti-Ghosting System (Serious Seeker) ---
  totalInterestsReceived: { type: Number, default: 0 },
  totalInterestsRepliedIn24h: { type: Number, default: 0 },
  replyRate: { type: Number, default: 0 },
  activityScore: { type: Number, default: 0 },
  isSeriousSeeker: { type: Boolean, default: false },
  adminRankScore: { type: Number, default: 0 },
  isDeveloper: { type: Boolean, default: false }
}, {
  timestamps: true
});

// High-performance compound indexes for matrimony search, daily picks, and rapid lookups
UserSchema.index({ isActive: 1, profileHidden: 1, gender: 1 });
UserSchema.index({ isActive: 1, gender: 1, adminRankScore: -1, isSeriousSeeker: -1, activityScore: -1 });
UserSchema.index({ isActive: 1, gender: 1, createdAt: -1 });
UserSchema.index({ phone: 1, isActive: 1 });
UserSchema.index({ pbId: 1, isActive: 1 });
UserSchema.index({ gender: 1, profileHidden: 1, maritalStatus: 1 });
UserSchema.index({ gender: 1, city: 1, dob: 1 });
UserSchema.index({ gender: 1, professionSector: 1, incomeBracket: 1 });

module.exports = mongoose.model('User', UserSchema);
