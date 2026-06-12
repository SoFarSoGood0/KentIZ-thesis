// ignore_for_file: unused_element

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_api.dart';

// ═══════════════════════════════════════════════════════════════
//  ENTRY
// ═══════════════════════════════════════════════════════════════

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0F1924),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const UrbanChainMobileApp());
}

// ═══════════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

class UC {
  UC._();

  static const bg       = Color(0xFF080D12);
  static const surface  = Color(0xFF0F1924);
  static const surface2 = Color(0xFF152030);
  static const border   = Color(0x14FFFFFF);
  static const border2  = Color(0x24FFFFFF);

  static const teal    = Color(0xFF14B8A6);
  static const tealDim = Color(0x1A14B8A6);

  static const text    = Color(0xFFF8FAFC);
  static const sub     = Color(0xFF94A3B8);
  static const muted   = Color(0xFF475569);

  static const ok      = Color(0xFF10B981);
  static const okDim   = Color(0x1A10B981);
  static const warn    = Color(0xFFF59E0B);
  static const warnDim = Color(0x1AF59E0B);
  static const err     = Color(0xFFEF4444);
  static const errDim  = Color(0x1AEF4444);
  static const info    = Color(0xFF3B82F6);
  static const infoDim = Color(0x1A3B82F6);
  static const purple  = Color(0xFF8B5CF6);

  static const double xs  = 4.0;
  static const double sm  = 8.0;
  static const double md  = 16.0;
  static const double lg  = 24.0;
  static const double xl  = 32.0;
  static const double xxl = 48.0;

  static TextStyle h1({Color color = text}) =>
      GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: color, height: 1.2);
  static TextStyle h2({Color color = text}) =>
      GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w700, color: color, height: 1.25);
  static TextStyle h3({Color color = text}) =>
      GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: color, height: 1.3);
  static TextStyle h4({Color color = text}) =>
      GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: color, height: 1.4);
  static TextStyle body({Color color = sub}) =>
      GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w400, color: color, height: 1.5);
  static TextStyle small({Color color = sub}) =>
      GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w400, color: color, height: 1.4);
  static TextStyle micro({Color color = muted}) =>
      GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w500, color: color, letterSpacing: 0.3);
  static TextStyle label({Color color = sub}) =>
      GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500, color: color);

  static BorderRadius r(double v) => BorderRadius.circular(v);
  static const r8   = BorderRadius.all(Radius.circular(8));
  static const r10  = BorderRadius.all(Radius.circular(10));
  static const r12  = BorderRadius.all(Radius.circular(12));
  static const r16  = BorderRadius.all(Radius.circular(16));
  static const r20  = BorderRadius.all(Radius.circular(20));
  static const r24  = BorderRadius.all(Radius.circular(24));
  static const rFull = BorderRadius.all(Radius.circular(100));
}

// ═══════════════════════════════════════════════════════════════
//  ENUMS + NAVIGATION
// ═══════════════════════════════════════════════════════════════

enum AppScreen {
  onboarding, login, home, createReport, aiAnalysis, reportSubmitted,
  myReports, reportDetail, notifications, profile,
}

enum AppTab { home, create, reports, notifications, profile }

typedef UCNav = void Function(AppScreen, [int?, PublicReport?]);

Future<Position?> resolveCurrentPosition() async {
  try {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
    if (!await Geolocator.isLocationServiceEnabled()) return null;
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } catch (_) {
      return await Geolocator.getLastKnownPosition();
    }
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  APP ROOT
// ═══════════════════════════════════════════════════════════════

class UrbanChainMobileApp extends StatelessWidget {
  const UrbanChainMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'KentİZ',
      builder: (context, child) =>
          _MobilePresentationFrame(child: child ?? const SizedBox.shrink()),
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: UC.bg,
        colorScheme: const ColorScheme.dark(
          primary: UC.teal,
          surface: UC.surface,
        ),
      ),
      home: const AppShell(),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  APP SHELL
// ═══════════════════════════════════════════════════════════════

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final _api = UrbanChainApi();

  late AppScreen _screen;
  AppTab _tab = AppTab.home;
  CitizenSession? _session;
  int? _reportId;
  PublicReport? _pendingReport;
  int _unreadCount = 0;
  Timer? _unreadTimer;

  static const _noNav = {
    AppScreen.onboarding,
    AppScreen.login,
    AppScreen.createReport,
    AppScreen.aiAnalysis,
    AppScreen.reportSubmitted,
  };

  @override
  void initState() {
    super.initState();
    _screen = AppScreen.onboarding;
  }

  void _startUnreadPolling() {
    _refreshUnread();
    _unreadTimer?.cancel();
    _unreadTimer = Timer.periodic(const Duration(seconds: 30), (_) => _refreshUnread());
  }

  Future<void> _refreshUnread() async {
    final token = _session?.token;
    if (token == null || token.isEmpty) return;
    final count = await _api.fetchUnreadCount(token: token);
    if (mounted) setState(() => _unreadCount = count);
  }

  @override
  void dispose() {
    _unreadTimer?.cancel();
    _api.dispose();
    super.dispose();
  }

  void _onLogin(CitizenSession s) {
    setState(() {
      _session = s;
      _screen = AppScreen.home;
      _tab = AppTab.home;
    });
    _startUnreadPolling();
  }

  void _onLogout() => setState(() {
    _unreadTimer?.cancel();
    _unreadCount = 0;
    _session = null;
    _screen = AppScreen.login;
    _tab = AppTab.home;
    _reportId = null;
    _pendingReport = null;
  });

  void navigate(AppScreen next, [int? reportId, PublicReport? report]) {
    setState(() {
      _screen = next;
      if (reportId != null) _reportId = reportId;
      if (report != null) _pendingReport = report;
      switch (next) {
        case AppScreen.home:          _tab = AppTab.home; break;
        case AppScreen.createReport:
        case AppScreen.aiAnalysis:   _tab = AppTab.create; break;
        case AppScreen.myReports:
        case AppScreen.reportDetail: _tab = AppTab.reports; break;
        case AppScreen.notifications: _tab = AppTab.notifications; break;
        case AppScreen.profile:      _tab = AppTab.profile; break;
        default: break;
      }
    });
  }

  void _onTab(AppTab t) {
    if (t == AppTab.notifications) setState(() => _unreadCount = 0);
    setState(() {
      _tab = t;
      _screen = switch (t) {
        AppTab.home          => AppScreen.home,
        AppTab.create        => AppScreen.createReport,
        AppTab.reports       => AppScreen.myReports,
        AppTab.notifications => AppScreen.notifications,
        AppTab.profile       => AppScreen.profile,
      };
    });
  }

  Widget _buildScreen() {
    switch (_screen) {
      case AppScreen.onboarding:
        return OnboardingScreen(onDone: () => setState(() => _screen = AppScreen.login));
      case AppScreen.login:
        return LoginScreenPage(onLogin: _onLogin);
      case AppScreen.home:
        return CitizenHomeScreenPage(navigate: navigate, session: _session, api: _api);
      case AppScreen.createReport:
        return CreateReportScreenPage(navigate: navigate, session: _session, api: _api);
      case AppScreen.aiAnalysis:
        return AIAnalysisScreenPage(navigate: navigate, report: _pendingReport);
      case AppScreen.reportSubmitted:
        return ReportSubmittedScreenPage(navigate: navigate, report: _pendingReport);
      case AppScreen.myReports:
        return CitizenReportsScreenPage(navigate: navigate, session: _session, api: _api);
      case AppScreen.reportDetail:
        return CitizenReportDetailScreenPage(navigate: navigate, session: _session, reportId: _reportId ?? 1, api: _api);
      case AppScreen.notifications:
        return CitizenNotificationsScreenPage(navigate: navigate, session: _session, api: _api);
      case AppScreen.profile:
        return ProfileScreenPage(navigate: navigate, session: _session, onLogout: _onLogout, api: _api);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: UC.bg,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Expanded(child: KeyedSubtree(key: ValueKey(_screen), child: _buildScreen())),
          if (!_noNav.contains(_screen))
            _UCBottomNav(active: _tab, onTap: _onTab, unreadCount: _unreadCount),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOTTOM NAV
// ═══════════════════════════════════════════════════════════════

class _UCBottomNav extends StatelessWidget {
  final AppTab active;
  final ValueChanged<AppTab> onTap;
  final int unreadCount;
  const _UCBottomNav({required this.active, required this.onTap, this.unreadCount = 0});

  @override
  Widget build(BuildContext context) {
    final btm = MediaQuery.of(context).padding.bottom;
    return Container(
      height: 62 + btm,
      padding: EdgeInsets.only(bottom: btm),
      decoration: const BoxDecoration(
        color: UC.surface,
        border: Border(top: BorderSide(color: UC.border, width: 0.5)),
      ),
      child: Row(children: [
        _NavItem(AppTab.home,          Icons.home_rounded,           'Ana Sayfa',   active, onTap),
        _NavItem(AppTab.reports,       Icons.description_outlined,   'Raporlarım',  active, onTap),
        _CreateBtn(onTap),
        _NavItem(AppTab.notifications, Icons.notifications_outlined, 'Bildirimler', active, onTap, badge: unreadCount),
        _NavItem(AppTab.profile,       Icons.person_outline_rounded, 'Profil',      active, onTap),
      ]),
    );
  }
}

class _NavItem extends StatelessWidget {
  final AppTab tab; final IconData icon; final String label;
  final AppTab active; final ValueChanged<AppTab> onTap;
  final int badge;
  const _NavItem(this.tab, this.icon, this.label, this.active, this.onTap, {this.badge = 0});

  @override
  Widget build(BuildContext context) {
    final sel = tab == active;
    return Expanded(
      child: GestureDetector(
        onTap: () => onTap(tab),
        behavior: HitTestBehavior.opaque,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Stack(clipBehavior: Clip.none, children: [
            Icon(icon, color: sel ? UC.teal : UC.muted, size: 22),
            if (badge > 0)
              Positioned(
                top: -5, right: -8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                  child: Text(
                    badge > 99 ? '99+' : '$badge',
                    style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700, height: 1.2),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 3),
          Text(label, style: UC.micro(color: sel ? UC.teal : UC.muted)),
        ]),
      ),
    );
  }
}

class _CreateBtn extends StatelessWidget {
  final ValueChanged<AppTab> onTap;
  const _CreateBtn(this.onTap);

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: () => onTap(AppTab.create),
      child: Center(
        child: Container(
          width: 50, height: 50,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [UC.teal, Color(0xFF0EA5E9)],
              begin: Alignment.topLeft, end: Alignment.bottomRight,
            ),
            borderRadius: UC.r16,
            boxShadow: [BoxShadow(color: UC.teal.withAlpha(55), blurRadius: 14, offset: const Offset(0, 4))],
          ),
          child: const Icon(Icons.add_rounded, color: Colors.white, size: 26),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
//  WEB FRAME
// ═══════════════════════════════════════════════════════════════

class _MobilePresentationFrame extends StatelessWidget {
  const _MobilePresentationFrame({required this.child});
  static const double _maxW = 430;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    return LayoutBuilder(builder: (ctx, constraints) {
      if (constraints.maxWidth <= 560) return child;
      final media = MediaQuery.of(ctx);
      final fw = _maxW.clamp(0.0, constraints.maxWidth.toDouble());
      return ColoredBox(
        color: const Color(0xFF040709),
        child: Center(
          child: Container(
            width: fw, height: constraints.maxHeight,
            decoration: BoxDecoration(
              color: UC.bg,
              border: Border.all(color: UC.border2),
              boxShadow: [BoxShadow(color: Colors.black.withAlpha(100), blurRadius: 48, offset: const Offset(0, 16))],
            ),
            child: ClipRRect(
              borderRadius: UC.r(0),
              child: MediaQuery(
                data: media.copyWith(size: Size(fw, constraints.maxHeight)),
                child: child,
              ),
            ),
          ),
        ),
      );
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════
//  ONBOARDING
// ═══════════════════════════════════════════════════════════════

class _OSlide {
  final IconData icon;
  final String title, desc;
  final Color color;
  const _OSlide({required this.icon, required this.title, required this.desc, required this.color});
}

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with TickerProviderStateMixin {
  final _ctrl = PageController();
  int _page = 0;
  late final AnimationController _floatCtrl;
  late final AnimationController _pulseCtrl;

  static const _slides = [
    _OSlide(
      icon: Icons.location_city_rounded,
      color: Color(0xFF14B8A6),
      title: "KentİZ'e Hoş Geldiniz",
      desc: 'Çevrendeki yol çukuru, çöp yığını veya bozuk kaldırım gibi sorunları fotoğraflayarak yetkililere bildirin.',
    ),
    _OSlide(
      icon: Icons.auto_awesome_rounded,
      color: Color(0xFF8B5CF6),
      title: 'Yapay Zeka Analiz Eder',
      desc: 'Fotoğrafını yükle; AI sistemi sorunu otomatik tanımlar, kategorize eder ve öncelik puanı atar.',
    ),
    _OSlide(
      icon: Icons.checklist_rounded,
      color: Color(0xFF38BDF8),
      title: 'Her Adımı Takip Et',
      desc: 'Bildiriminin inceleme, onaylanma ve çözüm süreçlerini hesabından gerçek zamanlı olarak izle.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _floatCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 3))
      ..repeat(reverse: true);
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _floatCtrl.dispose();
    _pulseCtrl.dispose();
    super.dispose();
  }

  void _finish() => widget.onDone();

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _slides.length - 1;
    final slide = _slides[_page];

    return Scaffold(
      backgroundColor: UC.bg,
      body: Stack(
        clipBehavior: Clip.none,
        children: [
          // Arka plan blobu — sağ üst
          Positioned(
            top: -90,
            right: -90,
            child: AnimatedBuilder(
              animation: _floatCtrl,
              builder: (_, __) {
                final dy = Tween<double>(begin: -16.0, end: 16.0)
                    .evaluate(CurvedAnimation(parent: _floatCtrl, curve: Curves.easeInOut));
                return Transform.translate(
                  offset: Offset(0, dy),
                  child: Container(
                    width: 300,
                    height: 300,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [
                        slide.color.withValues(alpha: 0.13),
                        slide.color.withValues(alpha: 0.0),
                      ]),
                    ),
                  ),
                );
              },
            ),
          ),
          // Arka plan blobu — sol alt
          Positioned(
            bottom: -70,
            left: -90,
            child: AnimatedBuilder(
              animation: _floatCtrl,
              builder: (_, __) {
                final dy = Tween<double>(begin: 16.0, end: -16.0)
                    .evaluate(CurvedAnimation(parent: _floatCtrl, curve: Curves.easeInOut));
                return Transform.translate(
                  offset: Offset(0, dy),
                  child: Container(
                    width: 270,
                    height: 270,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [
                        const Color(0xFF6D28D9).withValues(alpha: 0.11),
                        const Color(0xFF6D28D9).withValues(alpha: 0.0),
                      ]),
                    ),
                  ),
                );
              },
            ),
          ),
          // Arka plan blobu — sağ orta (ince)
          Positioned(
            bottom: 180,
            right: -40,
            child: AnimatedBuilder(
              animation: _floatCtrl,
              builder: (_, __) {
                final dy = Tween<double>(begin: -10.0, end: 10.0)
                    .evaluate(CurvedAnimation(parent: _floatCtrl, curve: Curves.easeInOut));
                return Transform.translate(
                  offset: Offset(0, dy),
                  child: Container(
                     width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [
                        slide.color.withValues(alpha: 0.06),
                        slide.color.withValues(alpha: 0.0),
                      ]),
                    ),
                  ),
                );
              },
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Geç butonu
                Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: TextButton(
                      onPressed: _finish,
                      child: Text('Geç', style: UC.label(color: UC.sub)),
                    ),
                  ),
                ),

                // Sayfa içerikleri
                Expanded(
                  child: PageView.builder(
                    controller: _ctrl,
                    onPageChanged: (i) => setState(() => _page = i),
                    itemCount: _slides.length,
                    itemBuilder: (ctx, i) => _OPage(
                      slide: _slides[i],
                      floatCtrl: _floatCtrl,
                      pulseCtrl: _pulseCtrl,
                    ),
                  ),
                ),

                // Nokta göstergesi
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_slides.length, (i) {
                    final active = i == _page;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeInOut,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: active ? 28 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: active ? _slides[i].color : UC.muted,
                        borderRadius: UC.rFull,
                        boxShadow: active
                            ? [BoxShadow(color: _slides[i].color.withValues(alpha: 0.5), blurRadius: 10)]
                            : null,
                      ),
                    );
                  }),
                ),

                const SizedBox(height: 32),

                // CTA butonu
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: UC.lg),
                  child: _UCPrimaryBtn(
                    label: isLast ? 'Hemen Başla' : 'Devam Et',
                    busy: false,
                    onTap: () {
                      if (isLast) {
                        _finish();
                      } else {
                        _ctrl.nextPage(
                          duration: const Duration(milliseconds: 400),
                          curve: Curves.easeInOut,
                        );
                      }
                    },
                  ),
                ),
                const SizedBox(height: 48),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OPage extends StatelessWidget {
  final _OSlide slide;
  final AnimationController floatCtrl, pulseCtrl;
  const _OPage({required this.slide, required this.floatCtrl, required this.pulseCtrl});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 36),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Yüzen ikon + hale
          AnimatedBuilder(
            animation: floatCtrl,
            builder: (_, child) {
              final dy = Tween<double>(begin: -10.0, end: 10.0)
                  .evaluate(CurvedAnimation(parent: floatCtrl, curve: Curves.easeInOut));
              return Transform.translate(offset: Offset(0, dy), child: child);
            },
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Nefes alan dış hale
                AnimatedBuilder(
                  animation: pulseCtrl,
                  builder: (_, __) {
                    final scale = Tween<double>(begin: 1.0, end: 1.28)
                        .evaluate(CurvedAnimation(parent: pulseCtrl, curve: Curves.easeInOut));
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 160,
                        height: 160,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [
                            slide.color.withValues(alpha: 0.18),
                            slide.color.withValues(alpha: 0.0),
                          ]),
                        ),
                      ),
                    );
                  },
                ),
                // İç halka + ikon
                Container(
                  width: 112,
                  height: 112,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: slide.color.withValues(alpha: 0.10),
                    border: Border.all(
                      color: slide.color.withValues(alpha: 0.35),
                      width: 1.5,
                    ),
                  ),
                  child: Icon(slide.icon, size: 50, color: slide.color),
                ),
              ],
            ),
          ),

          const SizedBox(height: 48),

          // Sayfa değişince fade+yukarı kayma animasyonu
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 420),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0, 0.14),
                  end: Offset.zero,
                ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
                child: child,
              ),
            ),
            child: Column(
              key: ValueKey(slide.title),
              children: [
                Text(slide.title, style: UC.h2(), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                Text(slide.desc, style: UC.body(), textAlign: TextAlign.center),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════

class LoginScreenPage extends StatefulWidget {
  const LoginScreenPage({super.key, required this.onLogin});
  final ValueChanged<CitizenSession> onLogin;
  @override
  State<LoginScreenPage> createState() => _LoginScreenPageState();
}

class _LoginScreenPageState extends State<LoginScreenPage>
    with SingleTickerProviderStateMixin {
  final _api = UrbanChainApi();
  bool _isLogin = true;
  bool _busy = false;
  String _error = '';
  bool _needsVerify = false;
  String _verifyEmail = '';
  bool _obscurePassword = true;

  late AnimationController _glowCtrl;

  final _emailCtrl    = TextEditingController();
  final _passCtrl     = TextEditingController();
  final _nameCtrl     = TextEditingController();
  final _regEmailCtrl = TextEditingController();
  final _regPassCtrl  = TextEditingController();
  final _codeCtrl     = TextEditingController();

  @override
  void initState() {
    super.initState();
    _glowCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 4))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _api.dispose();
    _glowCtrl.dispose();
    for (final c in [_emailCtrl, _passCtrl, _nameCtrl, _regEmailCtrl, _regPassCtrl, _codeCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _doLogin() async {
    if (_emailCtrl.text.trim().isEmpty || _passCtrl.text.isEmpty) {
      return setState(() => _error = 'Tüm alanları doldurun.');
    }
    setState(() { _busy = true; _error = ''; });
    try {
      final s = await _api.loginCitizen(email: _emailCtrl.text.trim(), password: _passCtrl.text);
      widget.onLogin(s);
    } on ApiException catch (e) {
      setState(() => _error = e.body.isNotEmpty ? e.body : 'Giriş başarısız.');
    } catch (_) {
      setState(() => _error = 'Bağlantı hatası.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _doRegister() async {
    if (_nameCtrl.text.trim().isEmpty || _regEmailCtrl.text.trim().isEmpty || _regPassCtrl.text.isEmpty) {
      return setState(() => _error = 'Tüm alanları doldurun.');
    }
    setState(() { _busy = true; _error = ''; });
    try {
      await _api.registerCitizen(
        fullName: _nameCtrl.text.trim(),
        email: _regEmailCtrl.text.trim(),
        password: _regPassCtrl.text,
      );
      setState(() { _needsVerify = true; _verifyEmail = _regEmailCtrl.text.trim(); });
    } on ApiException catch (e) {
      setState(() => _error = e.body.isNotEmpty ? e.body : 'Kayıt başarısız.');
    } catch (_) {
      setState(() => _error = 'Bağlantı hatası.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _doVerify() async {
    if (_codeCtrl.text.trim().length != 6) {
      return setState(() => _error = '6 haneli kodu girin.');
    }
    setState(() { _busy = true; _error = ''; });
    try {
      final s = await _api.verifyCitizen(email: _verifyEmail, code: _codeCtrl.text.trim());
      widget.onLogin(s);
    } on ApiException catch (e) {
      setState(() => _error = e.body.isNotEmpty ? e.body : 'Doğrulama başarısız.');
    } catch (_) {
      setState(() => _error = 'Bağlantı hatası.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFF030914),
    resizeToAvoidBottomInset: true,
    body: Stack(children: [
      const Positioned.fill(child: _AuthBackground()),
      SafeArea(child: _needsVerify ? _buildVerify() : _buildAuth()),
      Positioned(
        left: 0, right: 0, bottom: 0, height: 135,
        child: IgnorePointer(child: CustomPaint(painter: _CityLinePainter())),
      ),
    ]),
  );

  Widget _buildVerify() => SingleChildScrollView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 60),
        Center(child: Container(
          width: 94, height: 94,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            color: const Color(0xFF06151F),
            border: Border.all(color: const Color(0xFF12D9E6).withValues(alpha: 0.7)),
            boxShadow: [BoxShadow(color: const Color(0xFF12D9E6).withValues(alpha: 0.3), blurRadius: 40, spreadRadius: 1)],
          ),
          child: const Icon(Icons.mark_email_read_outlined, color: Color(0xFF15E6E1), size: 44),
        )),
        const SizedBox(height: 28),
        const Text('E-posta Doğrulaması',
            style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.8),
            textAlign: TextAlign.center),
        const SizedBox(height: 12),
        Text('$_verifyEmail\nadresine gönderilen 6 haneli kodu girin.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.56), fontSize: 16, height: 1.5),
            textAlign: TextAlign.center),
        const SizedBox(height: 36),
        _NeonInput(controller: _codeCtrl, hint: 'Doğrulama kodu',
            icon: Icons.pin_outlined, keyboardType: TextInputType.number),
        if (_error.isNotEmpty) ...[const SizedBox(height: 16), _UCErrorTile(_error)],
        const SizedBox(height: 24),
        _PrimaryButton(text: 'Doğrula', busy: _busy, onTap: _doVerify),
        const SizedBox(height: 20),
        TextButton(
          onPressed: () => setState(() { _needsVerify = false; _error = ''; }),
          child: Text('← Geri', style: TextStyle(fontSize: 16, color: Colors.white.withValues(alpha: 0.5))),
        ),
        const SizedBox(height: 40),
      ],
    ),
  );

  Widget _buildAuth() => SingleChildScrollView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
    child: Column(
      children: [
        const SizedBox(height: 18),

        AnimatedBuilder(
          animation: _glowCtrl,
          builder: (context, child) {
            final v = _glowCtrl.value;
            return Container(
              width: 94, height: 94,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(30),
                color: const Color(0xFF06151F),
                border: Border.all(color: const Color(0xFF12D9E6).withValues(alpha: 0.7)),
                boxShadow: [BoxShadow(
                  color: const Color(0xFF12D9E6).withValues(alpha: 0.22 + v * 0.18),
                  blurRadius: 34 + v * 18, spreadRadius: 1,
                )],
              ),
              child: const Icon(Icons.location_city_rounded, color: Color(0xFF15E6E1), size: 48),
            );
          },
        ),

        const SizedBox(height: 26),

        const Text('Kentİz', style: TextStyle(
          color: Colors.white, fontSize: 58, fontWeight: FontWeight.w900,
          height: 0.95, letterSpacing: -2.8,
        )),

        const SizedBox(height: 14),

        Text('Şehrin sesini duyur', style: TextStyle(
          color: Colors.white.withValues(alpha: 0.64),
          fontSize: 24, fontWeight: FontWeight.w500, letterSpacing: -0.4,
        )),

        const SizedBox(height: 44),

        _ModeSwitch(
          isLogin: _isLogin,
          onLoginTap: () => setState(() { _isLogin = true; _error = ''; }),
          onRegisterTap: () => setState(() { _isLogin = false; _error = ''; }),
        ),

        const SizedBox(height: 30),

        AnimatedSwitcher(
          duration: const Duration(milliseconds: 360),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween<Offset>(begin: const Offset(0.08, 0), end: Offset.zero).animate(animation),
              child: child,
            ),
          ),
          child: _isLogin ? _loginForm() : _registerForm(),
        ),

        const SizedBox(height: 34),

        if (_isLogin)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => _ForgotPasswordSheet(
                  api: _api,
                  initialEmail: _emailCtrl.text.trim(),
                ),
              ),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF12D9E6), padding: EdgeInsets.zero,
              ),
              child: const Text('Şifremi unuttum?', style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700,
                decoration: TextDecoration.underline,
                decorationColor: Color(0xFF12D9E6),
              )),
            ),
          ),

        SizedBox(height: _isLogin ? 34 : 20),

        if (_error.isNotEmpty) ...[_UCErrorTile(_error), const SizedBox(height: 16)],

        _PrimaryButton(
          text: _isLogin ? 'Giriş Yap' : 'Kayıt Ol',
          busy: _busy,
          onTap: _isLogin ? _doLogin : _doRegister,
        ),

        const SizedBox(height: 52),

        Row(children: [
          Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.08))),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Text('veya', style: TextStyle(
              color: Colors.white.withValues(alpha: 0.42), fontSize: 18, fontWeight: FontWeight.w500,
            )),
          ),
          Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.08))),
        ]),

        const SizedBox(height: 34),

        GestureDetector(
          onTap: () => setState(() { _isLogin = !_isLogin; _error = ''; }),
          child: RichText(
            text: TextSpan(
              text: _isLogin ? 'Hesabın yok mu?  ' : 'Zaten hesabın var mı?  ',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.52),
                fontSize: 20, fontWeight: FontWeight.w500,
              ),
              children: [
                TextSpan(
                  text: _isLogin ? 'Kayıt Ol' : 'Giriş Yap',
                  style: const TextStyle(color: Color(0xFF12D9E6), fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 96),
      ],
    ),
  );

  Widget _loginForm() => Column(
    key: const ValueKey('login-form'),
    children: [
      _NeonInput(
        controller: _emailCtrl, hint: 'E-posta',
        icon: Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress,
      ),
      const SizedBox(height: 16),
      _NeonInput(
        controller: _passCtrl, hint: 'Şifre',
        icon: Icons.lock_outline_rounded, obscureText: _obscurePassword,
        suffix: IconButton(
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          icon: Icon(
            _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            color: Colors.white.withValues(alpha: 0.45),
          ),
        ),
      ),
    ],
  );

  Widget _registerForm() => Column(
    key: const ValueKey('register-form'),
    children: [
      _NeonInput(controller: _nameCtrl, hint: 'Ad Soyad', icon: Icons.person_outline_rounded),
      const SizedBox(height: 16),
      _NeonInput(
        controller: _regEmailCtrl, hint: 'E-posta',
        icon: Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress,
      ),
      const SizedBox(height: 16),
      _NeonInput(
        controller: _regPassCtrl, hint: 'Şifre',
        icon: Icons.lock_outline_rounded, obscureText: _obscurePassword,
        suffix: IconButton(
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          icon: Icon(
            _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            color: Colors.white.withValues(alpha: 0.45),
          ),
        ),
      ),
    ],
  );
}

// ─── Login helper widgets ──────────────────────────────────────────

class _ModeSwitch extends StatelessWidget {
  final bool isLogin;
  final VoidCallback onLoginTap;
  final VoidCallback onRegisterTap;
  const _ModeSwitch({required this.isLogin, required this.onLoginTap, required this.onRegisterTap});

  @override
  Widget build(BuildContext context) => Container(
    height: 74,
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(
      color: const Color(0xFF071321).withValues(alpha: 0.86),
      borderRadius: BorderRadius.circular(34),
      border: Border.all(color: const Color(0xFF3D5671).withValues(alpha: 0.7)),
      boxShadow: [BoxShadow(color: const Color(0xFF12D9E6).withValues(alpha: 0.08), blurRadius: 24)],
    ),
    child: Stack(children: [
      AnimatedAlign(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        alignment: isLogin ? Alignment.centerLeft : Alignment.centerRight,
        child: FractionallySizedBox(
          widthFactor: 0.5,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(28),
              gradient: LinearGradient(colors: [
                const Color(0xFF13EFE4).withValues(alpha: 0.85),
                const Color(0xFF0B71FF).withValues(alpha: 0.72),
              ]),
              border: Border.all(color: const Color(0xFF12D9E6).withValues(alpha: 0.9)),
              boxShadow: [BoxShadow(
                color: const Color(0xFF12D9E6).withValues(alpha: 0.32),
                blurRadius: 28, spreadRadius: -4,
              )],
            ),
          ),
        ),
      ),
      Row(children: [
        Expanded(child: GestureDetector(
          onTap: onLoginTap,
          behavior: HitTestBehavior.opaque,
          child: Center(child: Text('Giriş Yap', style: TextStyle(
            color: isLogin ? Colors.white : Colors.white.withValues(alpha: 0.38),
            fontSize: 22, fontWeight: FontWeight.w800,
          ))),
        )),
        Expanded(child: GestureDetector(
          onTap: onRegisterTap,
          behavior: HitTestBehavior.opaque,
          child: Center(child: Text('Kayıt Ol', style: TextStyle(
            color: !isLogin ? Colors.white : Colors.white.withValues(alpha: 0.38),
            fontSize: 22, fontWeight: FontWeight.w700,
          ))),
        )),
      ]),
    ]),
  );
}

class _NeonInput extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Widget? suffix;
  const _NeonInput({
    required this.controller,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.obscureText = false,
    this.suffix,
  });

  @override
  Widget build(BuildContext context) => Container(
    height: 78,
    decoration: BoxDecoration(
      color: const Color(0xFF0A1727).withValues(alpha: 0.86),
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: const Color(0xFF52677F).withValues(alpha: 0.62)),
    ),
    child: TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      cursorColor: const Color(0xFF12D9E6),
      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        border: InputBorder.none,
        hintText: hint,
        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.32), fontSize: 20, fontWeight: FontWeight.w500),
        prefixIcon: Icon(icon, color: const Color(0xFF12D9E6).withValues(alpha: 0.78), size: 26),
        suffixIcon: suffix,
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      ),
    ),
  );
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final bool busy;
  final VoidCallback? onTap;
  const _PrimaryButton({required this.text, required this.busy, this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: busy ? null : onTap,
    child: Container(
      height: 82,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(colors: [Color(0xFF13D7C8), Color(0xFF15A7F0), Color(0xFF0B72FF)]),
        boxShadow: [BoxShadow(
          color: const Color(0xFF12D9E6).withValues(alpha: 0.35),
          blurRadius: 34, offset: const Offset(0, 16),
        )],
      ),
      child: Center(child: busy
        ? const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
        : Text(text, style: const TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: -0.4))),
    ),
  );
}

class _AuthBackground extends StatelessWidget {
  const _AuthBackground();

  @override
  Widget build(BuildContext context) => Stack(children: [
    Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0, -0.42),
          radius: 0.95,
          colors: [Color(0xFF082548), Color(0xFF04101F), Color(0xFF020710)],
          stops: [0.0, 0.48, 1.0],
        ),
      ),
    ),
    Positioned(
      top: 115, left: -70, right: -70,
      child: Container(
        height: 360,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFF12D9E6).withValues(alpha: 0.2), width: 1.5),
          boxShadow: [BoxShadow(color: const Color(0xFF12D9E6).withValues(alpha: 0.08), blurRadius: 80)],
        ),
      ),
    ),
    const Positioned.fill(child: CustomPaint(painter: _StarsPainter())),
    Positioned(
      left: 0, right: 0, bottom: 0, height: 260,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [
              const Color(0xFF020710),
              const Color(0xFF020710).withValues(alpha: 0.72),
              Colors.transparent,
            ],
          ),
        ),
      ),
    ),
  ]);
}

class _StarsPainter extends CustomPainter {
  const _StarsPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF12D9E6).withValues(alpha: 0.55)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.fill;

    final points = [
      Offset(size.width * 0.12, size.height * 0.11),
      Offset(size.width * 0.22, size.height * 0.19),
      Offset(size.width * 0.39, size.height * 0.06),
      Offset(size.width * 0.58, size.height * 0.10),
      Offset(size.width * 0.74, size.height * 0.18),
      Offset(size.width * 0.88, size.height * 0.13),
      Offset(size.width * 0.19, size.height * 0.86),
      Offset(size.width * 0.44, size.height * 0.91),
      Offset(size.width * 0.72, size.height * 0.88),
      Offset(size.width * 0.91, size.height * 0.82),
    ];
    for (final point in points) {
      canvas.drawCircle(point, 1.5, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ForgotPasswordSheet extends StatefulWidget {
  const _ForgotPasswordSheet({required this.api, this.initialEmail = ''});
  final UrbanChainApi api;
  final String initialEmail;
  @override
  State<_ForgotPasswordSheet> createState() => _ForgotPasswordSheetState();
}

class _ForgotPasswordSheetState extends State<_ForgotPasswordSheet> {
  late final TextEditingController _emailCtrl;
  bool _busy = false;
  bool _sent = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _emailCtrl = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      return setState(() => _error = 'E-posta adresinizi girin.');
    }
    setState(() { _busy = true; _error = ''; });
    try {
      await widget.api.requestPasswordReset(email);
      if (mounted) setState(() { _sent = true; _busy = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.body.isNotEmpty ? e.body : 'İstek gönderilemedi.'; _busy = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Bağlantı hatası.'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(24, 20, 24, 24 + bottom),
      decoration: const BoxDecoration(
        color: Color(0xFF0F1924),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Center(child: Container(width: 36, height: 4, decoration: BoxDecoration(
          color: Colors.white24, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 20),
        Row(children: [
          const Expanded(child: Text('Şifre Sıfırla', style: TextStyle(
            color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700))),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: const Icon(Icons.close_rounded, color: Colors.white54, size: 22),
          ),
        ]),
        const SizedBox(height: 8),
        Text(
          'Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı göndereceğiz.',
          style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 14, height: 1.5),
        ),
        const SizedBox(height: 24),
        if (_sent) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
            ),
            child: const Row(children: [
              Icon(Icons.check_circle_outline_rounded, color: Color(0xFF10B981), size: 20),
              SizedBox(width: 10),
              Expanded(child: Text(
                'Bağlantı gönderildi! Gelen kutunuzu kontrol edin.',
                style: TextStyle(color: Color(0xFF10B981), fontSize: 14, height: 1.4),
              )),
            ]),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => Navigator.pop(context),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF12D9E6)),
            child: const Text('Kapat', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ] else ...[
          _NeonInput(
            controller: _emailCtrl,
            hint: 'E-posta adresiniz',
            icon: Icons.alternate_email_rounded,
            keyboardType: TextInputType.emailAddress,
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            _UCErrorTile(_error),
          ],
          const SizedBox(height: 20),
          SizedBox(
            height: 58,
            child: ElevatedButton(
              onPressed: _busy ? null : _send,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                padding: EdgeInsets.zero,
              ),
              child: Ink(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF13D7C8), Color(0xFF15A7F0), Color(0xFF0B72FF)]),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Center(child: _busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                  : const Text('Bağlantı Gönder', style: TextStyle(
                      color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: -0.3))),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

class _CityLinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = const Color(0xFF12D9E6).withValues(alpha: 0.22)
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;

    final fillPaint = Paint()
      ..color = const Color(0xFF12D9E6).withValues(alpha: 0.04)
      ..style = PaintingStyle.fill;

    final baseY = size.height * 0.82;
    canvas.drawPath(Path()..moveTo(0, baseY)..lineTo(size.width, baseY), linePaint);

    void building(double x, double w, double h) {
      final rect = RRect.fromRectAndRadius(Rect.fromLTWH(x, baseY - h, w, h), const Radius.circular(2));
      canvas.drawRRect(rect, fillPaint);
      canvas.drawRRect(rect, linePaint);
      for (double yy = baseY - h + 14; yy < baseY - 8; yy += 16) {
        canvas.drawLine(Offset(x + w * 0.28, yy), Offset(x + w * 0.72, yy), linePaint);
      }
    }

    building(size.width * 0.08, 38, 56);
    building(size.width * 0.22, 54, 86);
    building(size.width * 0.67, 45, 74);
    building(size.width * 0.76, 58, 106);

    final bridge = Path()
      ..moveTo(size.width * 0.30, baseY)
      ..quadraticBezierTo(size.width * 0.42, baseY - 78, size.width * 0.54, baseY);
    canvas.drawPath(bridge, linePaint);

    canvas.drawLine(Offset(size.width * 0.31, baseY), Offset(size.width * 0.31, baseY - 76), linePaint);
    canvas.drawLine(Offset(size.width * 0.53, baseY), Offset(size.width * 0.53, baseY - 76), linePaint);

    final bus = RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.47, baseY - 30, 70, 30), const Radius.circular(8));
    canvas.drawRRect(bus, fillPaint);
    canvas.drawRRect(bus, linePaint);
    canvas.drawCircle(Offset(size.width * 0.49, baseY), 5, linePaint);
    canvas.drawCircle(Offset(size.width * 0.58, baseY), 5, linePaint);

    final pinCenter = Offset(size.width * 0.90, baseY - 42);
    final pinPath = Path()
      ..addOval(Rect.fromCircle(center: pinCenter, radius: 22))
      ..moveTo(pinCenter.dx, pinCenter.dy + 34)
      ..lineTo(pinCenter.dx - 12, pinCenter.dy + 16)
      ..lineTo(pinCenter.dx + 12, pinCenter.dy + 16)
      ..close();
    canvas.drawPath(pinPath, linePaint);
    canvas.drawCircle(pinCenter, 8, linePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ═══════════════════════════════════════════════════════════════
//  HOME SCREEN
// ═══════════════════════════════════════════════════════════════

class CitizenHomeScreenPage extends StatefulWidget {
  const CitizenHomeScreenPage({super.key, required this.navigate, required this.session, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final UrbanChainApi api;
  @override
  State<CitizenHomeScreenPage> createState() => _CitizenHomeScreenPageState();
}

class _CitizenHomeScreenPageState extends State<CitizenHomeScreenPage> {
  CitizenSummary? _summary;
  String? _locationText;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      if (widget.session != null) {
        _summary = await widget.api.fetchCitizenSummary(token: widget.session!.token);
      }
      final pos = await resolveCurrentPosition();
      if (pos != null && mounted) {
        try {
          final loc = await widget.api.reverseGeocode(latitude: pos.latitude, longitude: pos.longitude);
          if (mounted) setState(() => _locationText = loc.displayText);
        } catch (_) {}
      }
    } catch (_) {} finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.session == null) return _buildGuest();
    return _buildDashboard();
  }

  Widget _buildGuest() => Scaffold(
    backgroundColor: UC.bg,
    body: Center(child: Padding(
      padding: const EdgeInsets.all(UC.xl),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 88, height: 88,
          decoration: BoxDecoration(
            color: UC.tealDim, borderRadius: UC.r24,
            border: Border.all(color: UC.teal.withAlpha(60)),
          ),
          child: const Icon(Icons.location_city_rounded, color: UC.teal, size: 44),
        ),
        const SizedBox(height: UC.lg),
        Text('KentİZ', style: UC.h1()),
        const SizedBox(height: UC.sm),
        Text('Çevrenizdeki sorunları tespit edip belediyeye bildirin.', style: UC.body(), textAlign: TextAlign.center),
        const SizedBox(height: UC.xl),
        _UCPrimaryBtn(label: 'Giriş Yap', busy: false, onTap: () => widget.navigate(AppScreen.login)),
      ]),
    )),
  );

  Widget _buildDashboard() {
    final s = widget.session!;
    final firstName = s.fullName.split(' ').first;
    return Scaffold(
      backgroundColor: UC.bg,
      body: RefreshIndicator(
        color: UC.teal, backgroundColor: UC.surface, onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(UC.md, UC.lg, UC.md, UC.md), children: [
          // Header
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Merhaba,', style: UC.small()),
              Text(firstName, style: UC.h2()),
              if (_locationText != null) ...[
                const SizedBox(height: 3),
                Row(children: [
                  const Icon(Icons.location_on_outlined, size: 13, color: UC.teal),
                  const SizedBox(width: 3),
                  Flexible(child: Text(_locationText!, style: UC.micro(), overflow: TextOverflow.ellipsis)),
                ]),
              ],
            ])),
            Container(
              width: 44, height: 44,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [UC.teal, Color(0xFF0EA5E9)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: UC.r12,
              ),
              child: Center(child: Text(
                firstName.isNotEmpty ? firstName[0].toUpperCase() : '?',
                style: UC.h3(color: Colors.white),
              )),
            ),
          ]),

          const SizedBox(height: UC.lg),

          // Hero card
          GestureDetector(
            onTap: () => widget.navigate(AppScreen.createReport),
            child: Container(
              padding: const EdgeInsets.all(UC.lg),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF0F766E), Color(0xFF0E7490)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: UC.r16,
              ),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Sorun mu var?', style: UC.h3(color: Colors.white)),
                  const SizedBox(height: UC.xs),
                  Text('Fotoğraf çek, otomatik tespit edilsin.', style: UC.small(color: Colors.white70)),
                  const SizedBox(height: UC.md),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: UC.md, vertical: UC.sm),
                    decoration: BoxDecoration(color: Colors.white.withAlpha(30), borderRadius: UC.r8),
                    child: Text('Bildirim Oluştur →', style: UC.label(color: Colors.white)),
                  ),
                ])),
                const SizedBox(width: UC.md),
                const Icon(Icons.add_a_photo_outlined, color: Colors.white54, size: 52),
              ]),
            ),
          ),

          const SizedBox(height: UC.lg),
          Text('İstatistiklerim', style: UC.h4()),
          const SizedBox(height: UC.sm),

          if (_loading)
            const Center(child: Padding(
              padding: EdgeInsets.all(UC.xl),
              child: CircularProgressIndicator(color: UC.teal, strokeWidth: 2),
            ))
          else if (_summary != null)
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2, crossAxisSpacing: UC.sm, mainAxisSpacing: UC.sm, childAspectRatio: 1.65,
              ),
              children: [
                _StatCard(label: 'Toplam',    value: '${_summary!.totalReports}',         icon: Icons.bar_chart_rounded,    color: UC.teal),
                _StatCard(label: 'İncelemede', value: '${_summary!.pendingReviewReports}',  icon: Icons.schedule_rounded,     color: UC.warn),
                _StatCard(label: 'Onaylandı', value: '${_summary!.approvedReports}',       icon: Icons.check_circle_outline, color: UC.ok),
                _StatCard(label: 'Çözüldü',   value: '${_summary!.resolvedReports}',       icon: Icons.task_alt_rounded,     color: UC.purple),
              ],
            ),

          const SizedBox(height: UC.md),
          _UCGhostBtn(label: 'Tüm Raporlarım →', onTap: () => widget.navigate(AppScreen.myReports)),
          const SizedBox(height: UC.md),
        ]),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label, value; final IconData icon; final Color color;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(UC.md),
    decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Container(
        width: 32, height: 32,
        decoration: BoxDecoration(color: color.withAlpha(30), borderRadius: UC.r8),
        child: Icon(icon, color: color, size: 16),
      ),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: UC.h2()),
        Text(label, style: UC.micro()),
      ]),
    ]),
  );
}

// ═══════════════════════════════════════════════════════════════
//  CREATE REPORT SCREEN
// ═══════════════════════════════════════════════════════════════

class CreateReportScreenPage extends StatefulWidget {
  const CreateReportScreenPage({super.key, required this.navigate, required this.session, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final UrbanChainApi api;
  @override
  State<CreateReportScreenPage> createState() => _CreateReportScreenPageState();
}

class _CreateReportScreenPageState extends State<CreateReportScreenPage> {
  Uint8List? _imgBytes;
  String? _imgName;
  Position? _position;
  bool _gettingLoc = false;
  bool _uploading = false;
  String _error = '';
  final _notesCtrl = TextEditingController();
  final _picker = ImagePicker();

  @override
  void initState() { super.initState(); _fetchLocation(); }
  @override
  void dispose() { _notesCtrl.dispose(); super.dispose(); }

  Future<void> _fetchLocation() async {
    setState(() => _gettingLoc = true);
    final pos = await resolveCurrentPosition();
    if (mounted) setState(() { _position = pos; _gettingLoc = false; });
  }

  Future<void> _pickImage(ImageSource src) async {
    try {
      final picked = await _picker.pickImage(source: src, imageQuality: 85, maxWidth: 1600);
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      if (mounted) setState(() { _imgBytes = bytes; _imgName = picked.name; _error = ''; });
    } catch (_) {
      if (mounted) setState(() => _error = 'Fotoğraf seçilemedi.');
    }
  }

  Future<void> _submit() async {
    if (_imgBytes == null) return setState(() => _error = 'Bir fotoğraf seçin.');
    if (_position == null) return setState(() => _error = 'Gönderim için GPS açık olmalı.');
    setState(() { _uploading = true; _error = ''; });
    try {
      final report = await widget.api.submitReport(
        fileBytes: _imgBytes!,
        fileName: _imgName ?? 'photo.jpg',
        latitude: _position!.latitude,
        longitude: _position!.longitude,
        token: widget.session?.token,
      );
      if (mounted) widget.navigate(AppScreen.aiAnalysis, report.id, report);
    } on ApiException catch (e) {
      setState(() => _error = e.body.isNotEmpty ? e.body : 'Yükleme başarısız.');
    } catch (_) {
      setState(() => _error = 'Yükleme başarısız. Tekrar deneyin.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: UC.bg,
    body: SafeArea(child: Column(children: [
      _UCHeader(title: 'Bildirim Oluştur', onBack: () => widget.navigate(AppScreen.home)),
      Expanded(child: ListView(padding: const EdgeInsets.all(UC.md), children: [
        if (_imgBytes == null)
          _UploadArea(
            onCamera: () => _pickImage(ImageSource.camera),
            onGallery: () => _pickImage(ImageSource.gallery),
          )
        else
          _PhotoPreview(bytes: _imgBytes!, onRemove: () => setState(() { _imgBytes = null; _imgName = null; })),
        const SizedBox(height: UC.md),
        _LocationTile(loading: _gettingLoc, position: _position, onRetry: _fetchLocation),
        const SizedBox(height: UC.md),
        _UCField(ctrl: _notesCtrl, hint: 'Açıklama (isteğe bağlı)', icon: Icons.edit_note_rounded, maxLines: 3),
        if (_error.isNotEmpty) ...[const SizedBox(height: UC.sm), _UCErrorTile(_error)],
        const SizedBox(height: UC.lg),
        _UCPrimaryBtn(
          label: _uploading ? 'Gönderiliyor...' : 'Gönder',
          busy: _uploading,
          enabled: _imgBytes != null && _position != null,
          onTap: _submit,
        ),
        const SizedBox(height: UC.md),
      ])),
    ])),
  );
}

class _UploadArea extends StatelessWidget {
  final VoidCallback onCamera, onGallery;
  const _UploadArea({required this.onCamera, required this.onGallery});

  @override
  Widget build(BuildContext context) => Container(
    height: 210,
    decoration: BoxDecoration(
      color: UC.surface, borderRadius: UC.r16,
      border: Border.all(color: UC.border2, width: 1.5),
    ),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Container(
        width: 56, height: 56,
        decoration: const BoxDecoration(color: UC.tealDim, borderRadius: UC.r16),
        child: const Icon(Icons.add_a_photo_outlined, color: UC.teal, size: 26),
      ),
      const SizedBox(height: UC.sm),
      Text('Fotoğraf ekle', style: UC.h4(color: UC.sub)),
      const SizedBox(height: UC.xs),
      Text('Sorunu belgeleyin', style: UC.small()),
      const SizedBox(height: UC.md),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _SrcBtn(icon: Icons.camera_alt_outlined,    label: 'Kamera', onTap: onCamera),
        const SizedBox(width: UC.sm),
        _SrcBtn(icon: Icons.photo_library_outlined, label: 'Galeri',  onTap: onGallery),
      ]),
    ]),
  );
}

class _SrcBtn extends StatelessWidget {
  final IconData icon; final String label; final VoidCallback onTap;
  const _SrcBtn({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: UC.md, vertical: UC.sm),
      decoration: BoxDecoration(
        color: UC.tealDim, borderRadius: UC.r8,
        border: Border.all(color: UC.teal.withAlpha(60)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: UC.teal, size: 16),
        const SizedBox(width: UC.xs),
        Text(label, style: UC.label(color: UC.teal)),
      ]),
    ),
  );
}

class _PhotoPreview extends StatelessWidget {
  final Uint8List bytes; final VoidCallback onRemove;
  const _PhotoPreview({required this.bytes, required this.onRemove});

  @override
  Widget build(BuildContext context) => Stack(children: [
    ClipRRect(
      borderRadius: UC.r16,
      child: Image.memory(bytes, height: 230, width: double.infinity, fit: BoxFit.cover),
    ),
    Positioned(top: UC.sm, right: UC.sm, child: GestureDetector(
      onTap: onRemove,
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(color: Colors.black.withAlpha(160), borderRadius: UC.r8),
        child: const Icon(Icons.close_rounded, color: Colors.white, size: 16),
      ),
    )),
  ]);
}

class _LocationTile extends StatelessWidget {
  final bool loading; final Position? position; final VoidCallback onRetry;
  const _LocationTile({required this.loading, this.position, required this.onRetry});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(UC.md),
    decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
    child: Row(children: [
      Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: loading ? UC.warnDim : (position != null ? UC.tealDim : UC.errDim),
          borderRadius: UC.r8,
        ),
        child: loading
            ? const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: UC.warn, strokeWidth: 2)))
            : Icon(position != null ? Icons.location_on_rounded : Icons.location_off_outlined,
                color: position != null ? UC.teal : UC.err, size: 18),
      ),
      const SizedBox(width: UC.sm),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          loading ? 'Konum alınıyor...' : (position != null ? 'Konum alındı' : 'GPS açık değil'),
          style: UC.label(color: UC.text),
        ),
        if (!loading) Text(
          position != null
              ? '${position!.latitude.toStringAsFixed(5)}, ${position!.longitude.toStringAsFixed(5)}'
              : 'Gönderim için GPS açık olmalı.',
          style: UC.micro(),
        ),
      ])),
      if (!loading && position == null)
        GestureDetector(onTap: onRetry, child: Text('Yenile', style: UC.label(color: UC.teal))),
    ]),
  );
}

// ═══════════════════════════════════════════════════════════════
//  AI ANALYSIS SCREEN
// ═══════════════════════════════════════════════════════════════

class AIAnalysisScreenPage extends StatelessWidget {
  const AIAnalysisScreenPage({super.key, required this.navigate, this.report});
  final UCNav navigate;
  final PublicReport? report;

  @override
  Widget build(BuildContext context) {
    if (report == null) {
      return Scaffold(
        backgroundColor: UC.bg,
        body: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.error_outline_rounded, color: UC.muted, size: 44),
          const SizedBox(height: UC.sm),
          Text('Analiz bulunamadı.', style: UC.body()),
          const SizedBox(height: UC.md),
          _UCGhostBtn(label: 'Geri Dön', onTap: () => navigate(AppScreen.createReport)),
        ])),
      );
    }
    final r = report!;
    final pct = (r.topConfidence * 100).round();
    final confColor = pct >= 70 ? UC.ok : pct >= 40 ? UC.warn : UC.err;
    return Scaffold(
      backgroundColor: UC.bg,
      body: SafeArea(child: Column(children: [
        _UCHeader(title: 'AI Analizi', onBack: () => navigate(AppScreen.createReport)),
        Expanded(child: ListView(padding: const EdgeInsets.all(UC.md), children: [
          ClipRRect(
            borderRadius: UC.r16,
            child: Image.network(r.imageUrl, height: 230, width: double.infinity, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(height: 230, color: UC.surface,
                child: const Center(child: Icon(Icons.broken_image_outlined, color: UC.muted, size: 44)))),
          ),
          const SizedBox(height: UC.lg),
          Container(
            padding: const EdgeInsets.all(UC.md),
            decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
            child: Row(children: [
              Container(
                width: 60, height: 60,
                decoration: BoxDecoration(
                  color: confColor.withAlpha(30),
                  shape: BoxShape.circle,
                  border: Border.all(color: confColor, width: 2),
                ),
                child: Center(child: Text('$pct%', style: UC.h4(color: confColor))),
              ),
              const SizedBox(width: UC.md),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Tespit Güveni', style: UC.micro()),
                const SizedBox(height: 3),
                Text(r.displayType, style: UC.h3()),
                Text('Yapay zeka tarafından analiz edildi', style: UC.micro()),
              ])),
            ]),
          ),
          const SizedBox(height: UC.sm),
          _AnalysisStepsWidget(),
          const SizedBox(height: UC.lg),
          _UCPrimaryBtn(label: 'Devam Et', busy: false, onTap: () => navigate(AppScreen.reportSubmitted, r.id, r)),
          const SizedBox(height: UC.md),
        ])),
      ])),
    );
  }
}

class _AnalysisStepsWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final steps = ['Yükleme', 'AI Analizi', 'İnceleme'];
    return Container(
      padding: const EdgeInsets.all(UC.md),
      decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: List.generate(steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            return Expanded(child: Container(
              height: 2,
              margin: const EdgeInsets.only(top: 14, left: 4, right: 4),
              color: i < 3 ? UC.teal : UC.border2,
            ));
          }
          final si = i ~/ 2;
          final done = si < 2;
          return Column(children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                color: done ? UC.teal : UC.surface2,
                shape: BoxShape.circle,
              ),
              child: Icon(done ? Icons.check_rounded : Icons.radio_button_unchecked_rounded,
                  color: done ? Colors.white : UC.muted, size: 14),
            ),
            const SizedBox(height: 4),
            Text(steps[si], style: UC.micro()),
          ]);
        }),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  REPORT SUBMITTED SCREEN
// ═══════════════════════════════════════════════════════════════

class ReportSubmittedScreenPage extends StatelessWidget {
  const ReportSubmittedScreenPage({super.key, required this.navigate, this.report});
  final UCNav navigate;
  final PublicReport? report;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: UC.bg,
    body: SafeArea(child: Padding(
      padding: const EdgeInsets.all(UC.md),
      child: Column(children: [
        const Spacer(),
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(
            color: UC.tealDim, shape: BoxShape.circle,
            border: Border.all(color: UC.teal, width: 2),
          ),
          child: const Icon(Icons.check_rounded, color: UC.teal, size: 40),
        ),
        const SizedBox(height: UC.lg),
        Text('Bildirim Gönderildi!', style: UC.h2()),
        const SizedBox(height: UC.sm),
        Text('Bildiriminiz alındı ve inceleme sürecine alındı.', style: UC.body(), textAlign: TextAlign.center),
        if (report != null) ...[
          const SizedBox(height: UC.lg),
          Container(
            padding: const EdgeInsets.all(UC.md),
            decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
            child: Column(children: [
              _DetailRow('Bildirim No', '#${report!.id}'),
              const SizedBox(height: UC.sm),
              _DetailRow('Sorun Türü', report!.displayType),
              const SizedBox(height: UC.sm),
              _DetailRow('Konum', report!.locationText),
            ]),
          ),
        ],
        const Spacer(),
        if (report != null)
          _UCPrimaryBtn(
            label: 'Raporuma Git',
            busy: false,
            onTap: () => navigate(AppScreen.reportDetail, report!.id),
          ),
        const SizedBox(height: UC.sm),
        _UCGhostBtn(label: 'Ana Sayfaya Dön', onTap: () => navigate(AppScreen.home)),
        const SizedBox(height: UC.md),
      ]),
    )),
  );
}

// ═══════════════════════════════════════════════════════════════
//  MY REPORTS SCREEN
// ═══════════════════════════════════════════════════════════════

class CitizenReportsScreenPage extends StatefulWidget {
  const CitizenReportsScreenPage({super.key, required this.navigate, required this.session, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final UrbanChainApi api;
  @override
  State<CitizenReportsScreenPage> createState() => _CitizenReportsScreenPageState();
}

class _CitizenReportsScreenPageState extends State<CitizenReportsScreenPage> {
  List<PublicReport> _reports = [];
  bool _loading = true;
  String _error = '';
  String _filter = 'all';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      if (widget.session != null) {
        _reports = await widget.api.fetchCitizenReports(token: widget.session!.token);
      } else {
        _reports = await widget.api.fetchPublicReports();
      }
    } on ApiException catch (e) {
      setState(() => _error = e.body);
    } catch (_) {
      setState(() => _error = 'Raporlar yüklenemedi.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<PublicReport> get _filtered {
    if (_filter == 'all') return _reports;
    return _reports.where((r) {
      switch (_filter) {
        case 'review':   return r.status == 'in_review' || r.status == 'pending_review';
        case 'approved': return r.status == 'approved';
        case 'progress': return r.interventionStatus == 'in_progress' || r.interventionStatus == 'assigned';
        case 'resolved': return r.interventionStatus == 'resolved';
        default:         return true;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: UC.bg,
    body: SafeArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(UC.md, UC.md, UC.md, 0),
        child: Text('Raporlarım', style: UC.h2()),
      ),
      const SizedBox(height: UC.sm),
      SizedBox(
        height: 36,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: UC.md),
          children: [
            _FilterChip('Tümü',       'all',      _filter, (v) => setState(() => _filter = v)),
            _FilterChip('İncelemede', 'review',   _filter, (v) => setState(() => _filter = v)),
            _FilterChip('Onaylandı',  'approved', _filter, (v) => setState(() => _filter = v)),
            _FilterChip('İşlemde',    'progress', _filter, (v) => setState(() => _filter = v)),
            _FilterChip('Çözüldü',    'resolved', _filter, (v) => setState(() => _filter = v)),
          ],
        ),
      ),
      const SizedBox(height: UC.sm),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator(color: UC.teal, strokeWidth: 2))
        : _error.isNotEmpty
          ? Center(child: Padding(padding: const EdgeInsets.all(UC.md), child: _UCErrorTile(_error)))
          : _filtered.isEmpty
            ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.inbox_outlined, color: UC.muted, size: 48),
                const SizedBox(height: UC.sm),
                Text('Rapor bulunamadı.', style: UC.body()),
              ]))
            : RefreshIndicator(
                color: UC.teal, backgroundColor: UC.surface, onRefresh: _load,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(UC.md, 0, UC.md, UC.md),
                  itemCount: _filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: UC.sm),
                  itemBuilder: (_, i) => _ReportCard(
                    _filtered[i],
                    () => widget.navigate(AppScreen.reportDetail, _filtered[i].id),
                  ),
                ),
              )),
    ])),
  );
}

class _FilterChip extends StatelessWidget {
  final String label, value, current;
  final ValueChanged<String> onChange;
  const _FilterChip(this.label, this.value, this.current, this.onChange);

  @override
  Widget build(BuildContext context) {
    final sel = value == current;
    return GestureDetector(
      onTap: () => onChange(value),
      child: Container(
        margin: const EdgeInsets.only(right: UC.sm),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: sel ? UC.teal : UC.surface,
          borderRadius: UC.rFull,
          border: Border.all(color: sel ? UC.teal : UC.border2),
        ),
        child: Text(label, style: UC.small(color: sel ? Colors.white : UC.sub)),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final PublicReport report; final VoidCallback onTap;
  const _ReportCard(this.report, this.onTap);

  @override
  Widget build(BuildContext context) {
    final sc = _statusColor(report.status, report.interventionStatus);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
        child: Row(children: [
          ClipRRect(
            borderRadius: UC.r8,
            child: Image.network(report.imageUrl, width: 64, height: 64, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(width: 64, height: 64, color: UC.surface2,
                child: const Icon(Icons.broken_image_outlined, color: UC.muted, size: 22))),
          ),
          const SizedBox(width: UC.sm),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(report.displayType, style: UC.label(color: UC.text), overflow: TextOverflow.ellipsis)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: sc.withAlpha(30), borderRadius: UC.rFull),
                child: Text(report.displayStatus, style: UC.micro(color: sc)),
              ),
            ]),
            const SizedBox(height: 4),
            Text(report.locationText, style: UC.small(), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 3),
            Text(formatRelativeDate(report.createdAt), style: UC.micro()),
          ])),
          const SizedBox(width: UC.xs),
          const Icon(Icons.chevron_right_rounded, color: UC.muted, size: 18),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  REPORT DETAIL SCREEN
// ═══════════════════════════════════════════════════════════════

class CitizenReportDetailScreenPage extends StatefulWidget {
  const CitizenReportDetailScreenPage({super.key, required this.navigate, required this.session, required this.reportId, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final int reportId;
  final UrbanChainApi api;
  @override
  State<CitizenReportDetailScreenPage> createState() => _CitizenReportDetailScreenPageState();
}

class _CitizenReportDetailScreenPageState extends State<CitizenReportDetailScreenPage> {
  PublicReport? _report;
  bool _loading = true;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      _report = widget.session != null
          ? await widget.api.fetchCitizenReportDetail(widget.reportId, token: widget.session!.token)
          : await widget.api.fetchPublicReportDetail(widget.reportId);
    } on ApiException catch (e) {
      setState(() => _error = e.body);
    } catch (_) {
      setState(() => _error = 'Rapor yüklenemedi.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: UC.bg,
    body: SafeArea(child: Column(children: [
      _UCHeader(title: 'Rapor Detayı', onBack: () => widget.navigate(AppScreen.myReports)),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator(color: UC.teal, strokeWidth: 2))
        : _error.isNotEmpty
          ? Center(child: Padding(padding: const EdgeInsets.all(UC.md), child: _UCErrorTile(_error)))
          : _buildDetail()),
    ])),
  );

  Widget _buildDetail() {
    final r = _report!;
    final sc = _statusColor(r.status, r.interventionStatus);
    final timeline = _buildTimeline(r);
    return ListView(padding: const EdgeInsets.all(UC.md), children: [
      ClipRRect(
        borderRadius: UC.r16,
        child: Image.network(r.imageUrl, height: 230, width: double.infinity, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(height: 230, color: UC.surface,
            child: const Center(child: Icon(Icons.broken_image_outlined, color: UC.muted, size: 44)))),
      ),
      const SizedBox(height: UC.md),
      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(child: Text('#${r.id} – ${r.displayType}', style: UC.h4(), overflow: TextOverflow.ellipsis)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: sc.withAlpha(30), borderRadius: UC.rFull),
          child: Text(r.displayStatus, style: UC.small(color: sc)),
        ),
      ]),
      const SizedBox(height: UC.md),
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
        child: Column(children: [
          _DetailRow('Konum',    r.locationText),
          const SizedBox(height: UC.sm),
          _DetailRow('Tarih',    r.createdAt != null ? _fmtDate(r.createdAt!) : '-'),
          const SizedBox(height: UC.sm),
          _DetailRow('Öncelik',  r.displayPriority),
          if (r.assignedTeam != null && r.assignedTeam!.isNotEmpty) ...[
            const SizedBox(height: UC.sm),
            _DetailRow('Ekip', r.assignedTeam!),
          ],
          if (r.notes != null && r.notes!.isNotEmpty) ...[
            const SizedBox(height: UC.sm),
            _DetailRow('Not', r.notes!),
          ],
        ]),
      ),
      const SizedBox(height: UC.md),
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Durum Takibi', style: UC.h4()),
          const SizedBox(height: UC.md),
          ...timeline.asMap().entries.map((e) =>
            _TimelineRow(step: e.value, showLine: e.key < timeline.length - 1)),
        ]),
      ),
      if (r.afterImageUrl != null) ...[
        const SizedBox(height: UC.md),
        Text('Çözüm Fotoğrafı', style: UC.h4()),
        const SizedBox(height: UC.sm),
        ClipRRect(
          borderRadius: UC.r12,
          child: Image.network(r.afterImageUrl!, height: 180, width: double.infinity, fit: BoxFit.cover),
        ),
      ],
      const SizedBox(height: UC.md),
    ]);
  }
}

class _TStep {
  final String label; final bool done, active, rejected; final String? date;
  const _TStep({required this.label, required this.done, required this.active, this.rejected = false, this.date});
}

List<_TStep> _buildTimeline(PublicReport r) {
  final st = r.status;
  final iv = r.interventionStatus ?? '';
  final isRejected = st == 'rejected';
  return [
    _TStep(label: 'Gönderildi',  done: true,  active: false,
        date: r.createdAt != null ? _fmtDate(r.createdAt!) : null),
    _TStep(label: 'İncelemede',  done: st != 'pending_review' && st != 'in_review',
        active: st == 'in_review' || st == 'pending_review'),
    _TStep(label: isRejected ? 'Reddedildi' : 'Onaylandı',
        done: !isRejected && (st == 'approved' || ['assigned','in_progress','resolved'].contains(iv)),
        active: false,
        rejected: isRejected,
        date: isRejected && r.statusUpdatedAt != null ? _fmtDate(r.statusUpdatedAt!) : null),
    _TStep(label: 'Ekip Atandı', done: ['in_progress','resolved'].contains(iv), active: iv == 'assigned'),
    _TStep(label: 'İşlemde',     done: iv == 'resolved', active: iv == 'in_progress'),
    _TStep(label: 'Çözüldü',     done: iv == 'resolved', active: false),
  ];
}

class _TimelineRow extends StatelessWidget {
  final _TStep step; final bool showLine;
  const _TimelineRow({required this.step, required this.showLine});

  @override
  Widget build(BuildContext context) {
    final dc = step.rejected ? UC.err
        : step.done ? UC.ok
        : step.active ? UC.teal
        : UC.muted;
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [
          Container(
            width: 20, height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: step.rejected ? UC.err.withValues(alpha: 0.15)
                  : step.done ? UC.okDim
                  : step.active ? UC.tealDim
                  : Colors.transparent,
              border: Border.all(color: dc, width: 2),
            ),
            child: step.rejected
                ? const Icon(Icons.close_rounded, color: UC.err, size: 10)
                : step.done
                    ? const Icon(Icons.check_rounded, color: UC.ok, size: 10)
                    : null,
          ),
          if (showLine) Expanded(child: Container(width: 2, color: UC.border2, margin: const EdgeInsets.symmetric(vertical: 3))),
        ]),
        const SizedBox(width: UC.sm),
        Padding(
          padding: const EdgeInsets.only(bottom: UC.sm),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(step.label, style: UC.label(color: step.rejected ? UC.err : step.done || step.active ? UC.text : UC.muted)),
            if (step.date != null) Text(step.date!, style: UC.micro()),
          ]),
        ),
      ]),
    );
  }
}

String _fmtDate(DateTime d) {
  final l = d.toLocal();
  return '${l.day.toString().padLeft(2, '0')}.${l.month.toString().padLeft(2, '0')}.${l.year}';
}

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS SCREEN
// ═══════════════════════════════════════════════════════════════

class CitizenNotificationsScreenPage extends StatefulWidget {
  const CitizenNotificationsScreenPage({super.key, required this.navigate, required this.session, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final UrbanChainApi api;
  @override
  State<CitizenNotificationsScreenPage> createState() => _CitizenNotificationsScreenPageState();
}

class _CitizenNotificationsScreenPageState extends State<CitizenNotificationsScreenPage> {
  List<AppNotification> _items = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      _items = await widget.api.fetchNotifications(token: widget.session?.token);
      if (widget.session != null && _items.isNotEmpty) {
        await widget.api.markNotificationsSeen(token: widget.session!.token);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.body);
    } catch (_) {
      setState(() => _error = 'Bildirimler yüklenemedi.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = _items.where((n) => !n.isRead).length;
    return Scaffold(
      backgroundColor: UC.bg,
      body: SafeArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(UC.md, UC.md, UC.md, 0),
          child: Row(children: [
            Text('Bildirimler', style: UC.h2()),
            if (unread > 0) ...[
              const SizedBox(width: UC.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: const BoxDecoration(color: UC.teal, borderRadius: UC.rFull),
                child: Text('$unread', style: UC.micro(color: Colors.white)),
              ),
            ],
          ]),
        ),
        const SizedBox(height: UC.md),
        Expanded(child: _loading
          ? const Center(child: CircularProgressIndicator(color: UC.teal, strokeWidth: 2))
          : _error.isNotEmpty
            ? Center(child: Padding(padding: const EdgeInsets.all(UC.md), child: _UCErrorTile(_error)))
            : _items.isEmpty
              ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.notifications_off_outlined, color: UC.muted, size: 48),
                  const SizedBox(height: UC.sm),
                  Text('Henüz bildirim yok.', style: UC.body()),
                ]))
              : RefreshIndicator(
                  color: UC.teal, backgroundColor: UC.surface, onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(UC.md, 0, UC.md, UC.md),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: UC.sm),
                    itemBuilder: (_, i) => _NotifTile(
                      _items[i],
                      () => widget.navigate(AppScreen.reportDetail, _items[i].reportId),
                    ),
                  ),
                )),
      ])),
    );
  }
}

class _NotifTile extends StatelessWidget {
  final AppNotification n; final VoidCallback onTap;
  const _NotifTile(this.n, this.onTap);

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(UC.md),
      decoration: BoxDecoration(
        color: UC.surface, borderRadius: UC.r12,
        border: Border.all(color: n.isRead ? UC.border : UC.teal.withAlpha(60)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: Color(n.iconBg).withAlpha(50), borderRadius: UC.r10),
          child: Icon(_iconData(n.icon), color: Color(n.iconColor), size: 20),
        ),
        const SizedBox(width: UC.sm),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(n.title, style: UC.label(color: UC.text)),
          const SizedBox(height: 3),
          Text(n.message, style: UC.small(), maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 3),
          Text(n.date, style: UC.micro()),
        ])),
        if (!n.isRead)
          Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 4), decoration: const BoxDecoration(color: UC.teal, shape: BoxShape.circle)),
      ]),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE SCREEN
// ═══════════════════════════════════════════════════════════════

class ProfileScreenPage extends StatefulWidget {
  const ProfileScreenPage({super.key, required this.navigate, required this.session, required this.onLogout, required this.api});
  final UCNav navigate;
  final CitizenSession? session;
  final VoidCallback onLogout;
  final UrbanChainApi api;
  @override
  State<ProfileScreenPage> createState() => _ProfileScreenPageState();
}

class _ProfileScreenPageState extends State<ProfileScreenPage> {
  CitizenSummary? _summary;
  bool _loading = false;

  @override
  void initState() { super.initState(); if (widget.session != null) _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _summary = await widget.api.fetchCitizenSummary(token: widget.session!.token);
    } catch (_) {} finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.session == null) {
      return Scaffold(
        backgroundColor: UC.bg,
        body: Center(child: Padding(
          padding: const EdgeInsets.all(UC.xl),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.person_outline_rounded, color: UC.muted, size: 64),
            const SizedBox(height: UC.md),
            Text('Profili görüntülemek\niçin giriş yapın.', style: UC.body(), textAlign: TextAlign.center),
            const SizedBox(height: UC.lg),
            _UCPrimaryBtn(label: 'Giriş Yap', busy: false, onTap: () => widget.navigate(AppScreen.login)),
          ]),
        )),
      );
    }
    final s = widget.session!;
    final initial = s.fullName.isNotEmpty ? s.fullName[0].toUpperCase() : '?';
    return Scaffold(
      backgroundColor: UC.bg,
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(UC.md), children: [
        const SizedBox(height: UC.md),
        Center(child: Column(children: [
          Container(
            width: 76, height: 76,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [UC.teal, Color(0xFF0EA5E9)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
            ),
            child: Center(child: Text(initial, style: UC.h1(color: Colors.white))),
          ),
          const SizedBox(height: UC.sm),
          Text(s.fullName, style: UC.h3()),
          Text(s.email, style: UC.small()),
          const SizedBox(height: UC.xs),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: UC.tealDim, borderRadius: UC.rFull,
              border: Border.all(color: UC.teal.withAlpha(60)),
            ),
            child: Text('Aktif Vatandaş', style: UC.micro(color: UC.teal)),
          ),
        ])),
        const SizedBox(height: UC.lg),
        if (_loading)
          const Center(child: CircularProgressIndicator(color: UC.teal, strokeWidth: 2))
        else if (_summary != null)
          GridView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2, crossAxisSpacing: UC.sm, mainAxisSpacing: UC.sm, childAspectRatio: 2.4,
            ),
            children: [
              _MiniStat('Toplam',     '${_summary!.totalReports}',         UC.teal),
              _MiniStat('Çözüldü',   '${_summary!.resolvedReports}',       UC.ok),
              _MiniStat('Onaylandı', '${_summary!.approvedReports}',       UC.info),
              _MiniStat('Beklemede', '${_summary!.pendingReviewReports}',  UC.warn),
            ],
          ),
        const SizedBox(height: UC.lg),
        Text('Ayarlar', style: UC.h4()),
        const SizedBox(height: UC.sm),
        _SettingsItem(
          icon: Icons.person_outline_rounded,
          label: 'Hesap Bilgileri',
          onTap: () => showModalBottomSheet<void>(
            context: context, isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => _AccountSheet(session: widget.session!, api: widget.api),
          ),
        ),
        const SizedBox(height: UC.sm),
        _SettingsItem(
          icon: Icons.notifications_outlined,
          label: 'Bildirim Tercihleri',
          onTap: () => showModalBottomSheet<void>(
            context: context, isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const _NotifPrefsSheet(),
          ),
        ),
        const SizedBox(height: UC.sm),
        _SettingsItem(
          icon: Icons.shield_outlined,
          label: 'Gizlilik & Güvenlik',
          onTap: () => showModalBottomSheet<void>(
            context: context, isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => _PrivacySheet(onLogout: widget.onLogout),
          ),
        ),
        const SizedBox(height: UC.sm),
        _SettingsItem(
          icon: Icons.help_outline_rounded,
          label: 'Yardım & Destek',
          onTap: () => showModalBottomSheet<void>(
            context: context, isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const _HelpSheet(),
          ),
        ),
        const SizedBox(height: UC.lg),
        GestureDetector(
          onTap: widget.onLogout,
          child: Container(
            padding: const EdgeInsets.all(UC.md),
            decoration: BoxDecoration(
              color: UC.errDim, borderRadius: UC.r12,
              border: Border.all(color: UC.err.withAlpha(60)),
            ),
            child: Row(children: [
              const Icon(Icons.logout_rounded, color: UC.err, size: 20),
              const SizedBox(width: UC.sm),
              Text('Çıkış Yap', style: UC.label(color: UC.err)),
            ]),
          ),
        ),
        const SizedBox(height: UC.xl),
      ])),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label, value; final Color color;
  const _MiniStat(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(UC.md),
    decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
    child: Row(children: [
      Container(width: 5, height: 28, decoration: BoxDecoration(color: color, borderRadius: UC.r8)),
      const SizedBox(width: UC.sm),
      Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        Text(value, style: UC.h3()),
        Text(label, style: UC.micro()),
      ]),
    ]),
  );
}

class _SettingsItem extends StatelessWidget {
  final IconData icon; final String label; final VoidCallback onTap;
  const _SettingsItem({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(UC.md),
      decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border)),
      child: Row(children: [
        Icon(icon, color: UC.sub, size: 20),
        const SizedBox(width: UC.sm),
        Expanded(child: Text(label, style: UC.label())),
        const Icon(Icons.chevron_right_rounded, color: UC.muted, size: 20),
      ]),
    ),
  );
}

// ─── Account sheet ────────────────────────────────────────────────

class _AccountSheet extends StatefulWidget {
  final CitizenSession session;
  final UrbanChainApi api;
  const _AccountSheet({required this.session, required this.api});
  @override
  State<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<_AccountSheet> {
  bool _busy = false;
  String? _msg;
  bool _isError = false;

  Future<void> _sendReset() async {
    setState(() { _busy = true; _msg = null; });
    try {
      await widget.api.requestPasswordReset(widget.session.email);
      if (mounted) setState(() { _msg = 'Şifre sıfırlama e-postası gönderildi.'; _isError = false; });
    } catch (_) {
      if (mounted) setState(() { _msg = 'Gönderilemedi. Bağlantını kontrol et.'; _isError = true; });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _Sheet(
    title: 'Hesap Bilgileri',
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(
          width: 52, height: 52,
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [UC.teal, Color(0xFF0EA5E9)],
                begin: Alignment.topLeft, end: Alignment.bottomRight),
            shape: BoxShape.circle,
          ),
          child: Center(child: Text(
            widget.session.fullName.isNotEmpty ? widget.session.fullName[0].toUpperCase() : '?',
            style: UC.h3(color: Colors.white),
          )),
        ),
        const SizedBox(width: UC.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.session.fullName, style: UC.h4()),
          const SizedBox(height: 2),
          Text(widget.session.email, style: UC.small()),
        ])),
      ]),
      const SizedBox(height: UC.lg),
      _InfoRow(label: 'Ad Soyad', value: widget.session.fullName),
      const SizedBox(height: UC.sm),
      _InfoRow(label: 'E-posta', value: widget.session.email),
      const SizedBox(height: UC.lg),
      if (_msg != null) ...[
        Container(
          padding: const EdgeInsets.all(UC.sm),
          decoration: BoxDecoration(
            color: _isError ? UC.errDim : UC.okDim,
            borderRadius: UC.r8,
          ),
          child: Text(_msg!, style: UC.small(color: _isError ? UC.err : UC.ok)),
        ),
        const SizedBox(height: UC.sm),
      ],
      _UCPrimaryBtn(
        label: _busy ? 'Gönderiliyor…' : 'Şifre Sıfırlama E-postası Gönder',
        busy: _busy,
        onTap: _sendReset,
      ),
    ]),
  );
}

// ─── Notification prefs sheet ──────────────────────────────────────

class _NotifPrefsSheet extends StatefulWidget {
  const _NotifPrefsSheet();
  @override
  State<_NotifPrefsSheet> createState() => _NotifPrefsSheetState();
}

class _NotifPrefsSheetState extends State<_NotifPrefsSheet> {
  bool _statusUpdates = false;
  bool _resolved      = false;
  bool _weeklySummary = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    setState(() {
      _statusUpdates = p.getBool('notif_status') ?? false;
      _resolved      = p.getBool('notif_resolved') ?? false;
      _weeklySummary = p.getBool('notif_weekly') ?? false;
    });
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('notif_status', _statusUpdates);
    await p.setBool('notif_resolved', _resolved);
    await p.setBool('notif_weekly', _weeklySummary);
  }

  @override
  Widget build(BuildContext context) => _Sheet(
    title: 'Bildirim Tercihleri',
    child: Column(children: [
      _ToggleRow(
        icon: Icons.update_rounded,
        label: 'Durum Güncellemeleri',
        subtitle: 'Raporunun durumu değiştiğinde bildirim al',
        value: _statusUpdates,
        onChanged: (v) { setState(() => _statusUpdates = v); _save(); },
      ),
      const SizedBox(height: UC.sm),
      _ToggleRow(
        icon: Icons.task_alt_rounded,
        label: 'Çözüm Bildirimleri',
        subtitle: 'Raporunuz çözüldüğünde özel bildirim al',
        value: _resolved,
        onChanged: (v) { setState(() => _resolved = v); _save(); },
      ),
      const SizedBox(height: UC.sm),
      _ToggleRow(
        icon: Icons.summarize_outlined,
        label: 'Haftalık Özet',
        subtitle: 'Raporlarının haftalık özetini e-posta olarak al',
        value: _weeklySummary,
        onChanged: (v) { setState(() => _weeklySummary = v); _save(); },
      ),
    ]),
  );
}

// ─── Privacy sheet ─────────────────────────────────────────────────

class _PrivacySheet extends StatelessWidget {
  final VoidCallback onLogout;
  const _PrivacySheet({required this.onLogout});

  @override
  Widget build(BuildContext context) => _Sheet(
    title: 'Gizlilik & Güvenlik',
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Veri Güvenliği', style: UC.label()),
          const SizedBox(height: UC.xs),
          Text(
            'Verileriniz UrbanChain altyapısında şifreli olarak saklanmaktadır. '
            'Konumunuz ve fotoğraflarınız yalnızca ilgili belediye birimiyle paylaşılır.',
            style: UC.small(),
          ),
        ]),
      ),
      const SizedBox(height: UC.sm),
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Oturum Güvenliği', style: UC.label()),
          const SizedBox(height: UC.xs),
          Text('Oturumunuz 30 gün boyunca aktif kalır. Güvenli olmayan bir cihazda iseniz çıkış yapın.',
              style: UC.small()),
        ]),
      ),
      const SizedBox(height: UC.lg),
      GestureDetector(
        onTap: () { Navigator.pop(context); onLogout(); },
        child: Container(
          padding: const EdgeInsets.all(UC.md),
          decoration: BoxDecoration(color: UC.errDim, borderRadius: UC.r12,
              border: Border.all(color: UC.err.withAlpha(60))),
          child: Row(children: [
            const Icon(Icons.logout_rounded, color: UC.err, size: 20),
            const SizedBox(width: UC.sm),
            Text('Çıkış Yap', style: UC.label(color: UC.err)),
          ]),
        ),
      ),
    ]),
  );
}

// ─── Help sheet ────────────────────────────────────────────────────

class _HelpSheet extends StatelessWidget {
  const _HelpSheet();

  @override
  Widget build(BuildContext context) => _Sheet(
    title: 'Yardım & Destek',
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Sık Sorulan Sorular', style: UC.label()),
      const SizedBox(height: UC.sm),
      const _FaqItem('Nasıl rapor oluştururum?',
          'Alt menüdeki + butonuna dokunun, fotoğraf çekin ve konumunuzu onaylayın. '
          'Yapay zeka sorunu otomatik tespit eder.'),
      const SizedBox(height: UC.xs),
      const _FaqItem('Raporumun incelenmesi ne kadar sürer?',
          'Raporlar genellikle 1–3 iş günü içinde incelenir. '
          'Durum değişikliklerinde bildirim alırsınız.'),
      const SizedBox(height: UC.xs),
      const _FaqItem('Çözüm fotoğrafı nedir?',
          'Belediye ekibi sorunu çözdükten sonra fotoğraf yükler. '
          'Rapor detay sayfasında görebilirsiniz.'),
      const SizedBox(height: UC.lg),
      Text('İletişim', style: UC.label()),
      const SizedBox(height: UC.sm),
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
        child: Row(children: [
          const Icon(Icons.mail_outline_rounded, color: UC.teal, size: 18),
          const SizedBox(width: UC.sm),
          Text('destek@kentiz.com.tr', style: UC.small(color: UC.text)),
        ]),
      ),
      const SizedBox(height: UC.sm),
      Container(
        padding: const EdgeInsets.all(UC.md),
        decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
        child: Row(children: [
          const Icon(Icons.info_outline_rounded, color: UC.muted, size: 18),
          const SizedBox(width: UC.sm),
          Text('Kentiz v1.0.0', style: UC.small()),
        ]),
      ),
    ]),
  );
}

// ─── Shared sheet wrapper ──────────────────────────────────────────

class _Sheet extends StatelessWidget {
  final String title;
  final Widget child;
  const _Sheet({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: UC.surface,
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    padding: EdgeInsets.fromLTRB(
      UC.lg, UC.md, UC.lg,
      UC.lg + MediaQuery.of(context).viewInsets.bottom,
    ),
    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Center(child: Container(
        width: 36, height: 4,
        decoration: const BoxDecoration(color: UC.border2, borderRadius: UC.rFull),
      )),
      const SizedBox(height: UC.md),
      Row(children: [
        Expanded(child: Text(title, style: UC.h3())),
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(color: UC.surface2, shape: BoxShape.circle),
            child: const Icon(Icons.close_rounded, color: UC.sub, size: 18),
          ),
        ),
      ]),
      const SizedBox(height: UC.lg),
      child,
      const SizedBox(height: UC.md),
    ]),
  );
}

// ─── Sheet helper widgets ──────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final String label, value;
  const _InfoRow({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: UC.md, vertical: 12),
    decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
    child: Row(children: [
      SizedBox(width: 80, child: Text(label, style: UC.small())),
      Expanded(child: Text(value, style: UC.small(color: UC.text))),
    ]),
  );
}

class _ToggleRow extends StatelessWidget {
  final IconData icon;
  final String label, subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({required this.icon, required this.label, required this.subtitle,
      required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: UC.md, vertical: 12),
    decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
    child: Row(children: [
      Icon(icon, color: UC.sub, size: 20),
      const SizedBox(width: UC.sm),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: UC.label()),
        Text(subtitle, style: UC.micro()),
      ])),
      Switch(
        value: value, onChanged: onChanged,
        activeThumbColor: Colors.white,
        activeTrackColor: UC.teal,
        inactiveThumbColor: UC.sub,
        inactiveTrackColor: UC.surface2,
      ),
    ]),
  );
}

class _FaqItem extends StatelessWidget {
  final String q, a;
  const _FaqItem(this.q, this.a);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(UC.md),
    decoration: const BoxDecoration(color: UC.surface2, borderRadius: UC.r12),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(q, style: UC.label()),
      const SizedBox(height: UC.xs),
      Text(a, style: UC.small()),
    ]),
  );
}

// ═══════════════════════════════════════════════════════════════
//  SHARED WIDGETS
// ═══════════════════════════════════════════════════════════════

class _UCHeader extends StatelessWidget {
  final String title; final VoidCallback? onBack;
  const _UCHeader({required this.title, this.onBack});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(UC.md, UC.sm, UC.md, 0),
    child: Row(children: [
      if (onBack != null) ...[
        GestureDetector(
          onTap: onBack,
          child: Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r8, border: Border.all(color: UC.border)),
            child: const Icon(Icons.arrow_back_ios_new_rounded, color: UC.sub, size: 16),
          ),
        ),
        const SizedBox(width: UC.sm),
      ],
      Text(title, style: UC.h4()),
    ]),
  );
}

class _UCField extends StatelessWidget {
  final TextEditingController ctrl;
  final String hint;
  final IconData icon;
  final int? maxLines;

  const _UCField({
    required this.ctrl,
    required this.hint,
    required this.icon,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) => TextField(
    controller: ctrl,
    maxLines: maxLines,
    style: GoogleFonts.inter(fontSize: 15, color: UC.text),
    decoration: InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.inter(fontSize: 15, color: UC.muted),
      prefixIcon: Icon(icon, color: UC.muted, size: 18),
      counterText: '',
      filled: true,
      fillColor: UC.surface2,
      contentPadding: const EdgeInsets.symmetric(horizontal: UC.md, vertical: 14),
      border: const OutlineInputBorder(borderRadius: UC.r12, borderSide: BorderSide(color: UC.border2)),
      enabledBorder: const OutlineInputBorder(borderRadius: UC.r12, borderSide: BorderSide(color: UC.border2)),
      focusedBorder: const OutlineInputBorder(borderRadius: UC.r12, borderSide: BorderSide(color: UC.teal, width: 1.5)),
    ),
  );
}

class _UCPrimaryBtn extends StatelessWidget {
  final String label; final bool busy; final VoidCallback? onTap; final bool enabled;
  const _UCPrimaryBtn({required this.label, required this.busy, this.onTap, this.enabled = true});

  @override
  Widget build(BuildContext context) {
    final can = enabled && !busy && onTap != null;
    return GestureDetector(
      onTap: can ? onTap : null,
      child: Container(
        height: 52, width: double.infinity,
        decoration: BoxDecoration(
          gradient: can ? const LinearGradient(
            colors: [UC.teal, Color(0xFF0EA5E9)],
            begin: Alignment.centerLeft, end: Alignment.centerRight,
          ) : null,
          color: can ? null : UC.surface2,
          borderRadius: UC.r12,
        ),
        child: Center(child: busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : Text(label, style: UC.label(color: can ? Colors.white : UC.muted))),
      ),
    );
  }
}

class _UCGhostBtn extends StatelessWidget {
  final String label; final VoidCallback onTap;
  const _UCGhostBtn({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      height: 48, width: double.infinity,
      decoration: BoxDecoration(color: UC.surface, borderRadius: UC.r12, border: Border.all(color: UC.border2)),
      child: Center(child: Text(label, style: UC.label())),
    ),
  );
}

class _UCErrorTile extends StatelessWidget {
  final String message;
  const _UCErrorTile(this.message);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(UC.md),
    decoration: BoxDecoration(
      color: UC.errDim, borderRadius: UC.r8,
      border: Border.all(color: UC.err.withAlpha(60)),
    ),
    child: Row(children: [
      const Icon(Icons.error_outline_rounded, color: UC.err, size: 16),
      const SizedBox(width: UC.sm),
      Expanded(child: Text(message, style: UC.small(color: UC.err))),
    ]),
  );
}

class _DetailRow extends StatelessWidget {
  final String label, value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
    SizedBox(width: 80, child: Text(label, style: UC.small())),
    Expanded(child: Text(value, style: UC.small(color: UC.text))),
  ]);
}

Color _statusColor(String status, String? intervention) {
  final eff = (intervention != null && intervention.isNotEmpty) ? intervention : status;
  return switch (eff) {
    'resolved'    => UC.ok,
    'in_progress' => UC.warn,
    'assigned'    => UC.purple,
    'approved'    => UC.info,
    'rejected'    => UC.err,
    _             => UC.muted,
  };
}

IconData _iconData(String name) => switch (name) {
  'check_circle' => Icons.check_circle_outline_rounded,
  'people'       => Icons.people_outline_rounded,
  'handyman'     => Icons.handyman_outlined,
  'warning'      => Icons.warning_amber_outlined,
  _              => Icons.notifications_outlined,
};
