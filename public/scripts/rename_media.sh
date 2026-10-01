#!/usr/bin/env bash

# ==============================================================================
# TSI Medya Dosyası Otomatik İsim Güncelleme ve TMDB Modülü (WebDAV / FTP / Local)
# ==============================================================================
# Çalıştırma:
#   curl -sSL https://movie.fatihates.com.tr/scripts/rename_media.sh | sudo bash
# ==============================================================================

set -e

# Renkli Çıktı Tanımlamaları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Varsayılan Ayarlar
PROTOCOL=""
REMOTE_HOST=""
REMOTE_URL=""
REMOTE_USER=""
REMOTE_PASS=""
REMOTE_PORT="21"
REMOTE_DIR="/"
DRY_RUN=false
RECURSIVE=true
TMDB_API_KEY="d58049c10606da5d58e6081d106fed10"

# TTY Üzerinden Girdi Okuma Fonksiyonu (curl | sudo bash desteği için)
read_tty() {
    local prompt="$1"
    local var_name="$2"
    local is_secret="${3:-false}"
    
    if [ "$is_secret" = true ]; then
        stty -echo 2>/dev/null || true
        printf "${CYAN}%s${NC}" "$prompt" > /dev/tty
        read -r val < /dev/tty
        stty echo 2>/dev/null || true
        echo "" > /dev/tty
    else
        printf "${CYAN}%s${NC}" "$prompt" > /dev/tty
        read -r val < /dev/tty
    fi
    eval "$var_name=\"\$val\""
}

# Başlık Banner Gösterimi
show_banner() {
    clear 2>/dev/null || true
    echo -e "${MAGENTA}================================================================${NC}"
    echo -e "${CYAN}   🚀 TSI Medya Otomatik İsim Güncelleme & TMDB Ayrıştırma    ${NC}"
    echo -e "${MAGENTA}================================================================${NC}"
    echo ""
}

# Bağımlılık Kontrolü & Otomatik Yükleme
check_dependencies() {
    echo -e "${BLUE}[+] Gerekli sistem araçları kontrol ediliyor...${NC}"
    local missing_pkgs=()

    for cmd in curl php ffprobe; do
        if ! command -v $cmd &> /dev/null; then
            missing_pkgs+=("$cmd")
        fi
    done

    if [ ${#missing_pkgs[@]} -gt 0 ]; then
        echo -e "${YELLOW}[!] Eksik paketler tespit edildi: ${missing_pkgs[*]}${NC}"
        if command -v apt-get &> /dev/null; then
            echo -e "${BLUE}[+] apt-get ile paketler yükleniyor...${NC}"
            apt-get update -qq && apt-get install -y -qq curl php-cli ffmpeg php-curl php-mbstring php-xml || true
        elif command -v yum &> /dev/null; then
            echo -e "${BLUE}[+] yum ile paketler yükleniyor...${NC}"
            yum install -y -q curl php-cli ffmpeg || true
        fi
    fi

    # ffprobe yolunu garanti et
    FFPROBE_CMD="ffprobe"
    if ! command -v ffprobe &> /dev/null; then
        if [ -f "/c/ffmpeg/bin/ffprobe.exe" ]; then
            FFPROBE_CMD="/c/ffmpeg/bin/ffprobe.exe"
        elif [ -f "C:/ffmpeg/bin/ffprobe.exe" ]; then
            FFPROBE_CMD="C:/ffmpeg/bin/ffprobe.exe"
        elif [ -f "/usr/bin/ffprobe" ]; then
            FFPROBE_CMD="/usr/bin/ffprobe"
        elif [ -f "/usr/local/bin/ffprobe" ]; then
            FFPROBE_CMD="/usr/local/bin/ffprobe"
        fi
    fi
}

# Parametre Ayrıştırma (CLI Üzerinden Verilmişse)
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --protocol|--type) PROTOCOL="$2"; shift 2 ;;
            --url) REMOTE_URL="$2"; shift 2 ;;
            --host) REMOTE_HOST="$2"; shift 2 ;;
            --port) REMOTE_PORT="$2"; shift 2 ;;
            --user) REMOTE_USER="$2"; shift 2 ;;
            --pass) REMOTE_PASS="$2"; shift 2 ;;
            --dir|--remote-dir) REMOTE_DIR="$2"; shift 2 ;;
            --dry-run) DRY_RUN=true; shift ;;
            --tmdb-key) TMDB_API_KEY="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
}

# İnteraktif Sunucu ve Bağlantı Seçim Menüsü
interactive_setup() {
    show_banner

    if [ -z "$PROTOCOL" ]; then
        echo -e "${YELLOW}Lütfen işlem yapacağınız bağlantı türünü seçin:${NC}"
        echo "  [1] WebDAV Sunucusu (Hetzner Storage Box, Nextcloud, ownCloud vb.)"
        echo "  [2] FTP / FTPS Sunucusu"
        echo "  [3] Yerel Dizin / Mount Alanı"
        echo ""
        read_tty "Seçiminiz (1-3) [Varsayılan: 1]: " choice
        case "$choice" in
            2) PROTOCOL="ftp" ;;
            3) PROTOCOL="local" ;;
            *) PROTOCOL="webdav" ;;
        esac
    fi

    echo ""
    case "$PROTOCOL" in
        webdav)
            echo -e "${GREEN}--- WebDAV Bağlantı Bilgileri ---${NC}"
            if [ -z "$REMOTE_URL" ]; then
                read_tty "WebDAV URL (Örn: https://u123456.your-storagebox.de): " REMOTE_URL
            fi
            if [ -z "$REMOTE_USER" ]; then
                read_tty "Kullanıcı Adı: " REMOTE_USER
            fi
            if [ -z "$REMOTE_PASS" ]; then
                read_tty "Şifre: " REMOTE_PASS true
            fi
            if [ "$REMOTE_DIR" =="/" ]; then
                read_tty "Hedef Klasör Yolu (Örn: /film veya /) [Varsayılan: /]: " input_dir
                REMOTE_DIR="${input_dir:-/}"
            fi
            ;;

        ftp)
            echo -e "${GREEN}--- FTP Bağlantı Bilgileri ---${NC}"
            if [ -z "$REMOTE_HOST" ]; then
                read_tty "FTP Sunucu Adresi / IP (Örn: ftp.example.com): " REMOTE_HOST
            fi
            if [ "$REMOTE_PORT" = "21" ]; then
                read_tty "Port [Varsayılan: 21]: " input_port
                REMOTE_PORT="${input_port:-21}"
            fi
            if [ -z "$REMOTE_USER" ]; then
                read_tty "Kullanıcı Adı: " REMOTE_USER
            fi
            if [ -z "$REMOTE_PASS" ]; then
                read_tty "Şifre: " REMOTE_PASS true
            fi
            if [ "$REMOTE_DIR" = "/" ]; then
                read_tty "Hedef Klasör Yolu (Örn: /film) [Varsayılan: /]: " input_dir
                REMOTE_DIR="${input_dir:-/}"
            fi
            ;;

        local)
            echo -e "${GREEN}--- Yerel Dizin Bilgileri ---${NC}"
            if [ "$REMOTE_DIR" = "/" ]; then
                read_tty "Taranacak Klasör Yolu (Örn: /mnt/storagebox/filmler): " input_dir
                REMOTE_DIR="$input_dir"
            fi
            ;;
    esac

    echo ""
    read_tty "Simülasyon Modu (Değişiklik yapmadan test et) [e/H]? " dry_choice
    case "$dry_choice" in
        [eE]|[yY]|evet|Evet) DRY_RUN=true ;;
        *) DRY_RUN=false ;;
    esac
}

# ==============================================================================
# TMDB ve İsim Ayrıştırma Yardımcı Fonksiyonları
# ==============================================================================

# Başlık Metnini Nokta İle Ayrılmış Standardize Formata Dönüştürme (Latin ASCII)
sanitize_title() {
    local text="$1"
    if command -v php &> /dev/null; then
        php -r '
            $str = $argv[1];
            $sq = chr(39);
            $map = array(
                "ç"=>"c", "Ç"=>"C", "ğ"=>"g", "Ğ"=>"G", "ı"=>"i", "İ"=>"I",
                "ö"=>"o", "Ö"=>"O", "ş"=>"s", "Ş"=>"S", "ü"=>"u", "Ü"=>"U",
                "â"=>"a", "Â"=>"A", "î"=>"i", "Î"=>"I", "û"=>"u", "Û"=>"U",
                "é"=>"e", "è"=>"e", "ê"=>"e", "à"=>"a", "á"=>"a", "ñ"=>"n",
                "’"=>$sq, "‘"=>$sq, "`"=>$sq, "´"=>$sq
            );
            $str = strtr($str, $map);
            if (function_exists("iconv")) {
                $conv = @iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $str);
                if ($conv !== false && !empty($conv)) {
                    $str = $conv;
                }
            }
            $str = preg_replace("/[^a-zA-Z0-9\x27]+/", ".", $str);
            $str = preg_replace("/\.\.+/", ".", $str);
            echo trim($str, ".");
        ' "$text" 2>/dev/null
    else
        echo "$text" | sed \
            -e "s/[’‘\`´]/'/g" \
            -e 's/ç/c/g' -e 's/Ç/C/g' \
            -e 's/ğ/g/g' -e 's/Ğ/G/g' \
            -e 's/ı/i/g' -e 's/İ/I/g' \
            -e 's/ö/o/g' -e 's/Ö/O/g' \
            -e 's/ş/s/g' -e 's/Ş/S/g' \
            -e 's/ü/u/g' -e 's/Ü/U/g' \
            -e "s/[^a-zA-Z0-9']\+/./g" -e 's/\.\.\+/./g' -e 's/^\.//' -e 's/\.$//'
    fi
}

# Medya Tipi Tespiti (Film vs Dizi)
detect_media_type() {
    local filepath="$1"
    local filename="$2"
    
    if echo "$filename" | grep -iqE '\bS[0-9]{1,2}E[0-9]{1,2}\b|\b[0-9]{1,2}x[0-9]{1,2}\b'; then
        echo "series"
        return
    fi

    if echo "$filepath/$filename" | grep -iqE 'dizi|series|tv.shows|season|sezon'; then
        echo "series"
        return
    fi

    echo "movie"
}

# Sezon ve Bölüm Etiketini Çıkarma (Örn: S01E05)
extract_season_episode() {
    local filename="$1"
    
    if echo "$filename" | grep -iqE '\bS([0-9]{1,2})E([0-9]{1,2})\b'; then
        local s=$(echo "$filename" | grep -ioE '\bS[0-9]{1,2}E[0-9]{1,2}\b' | head -n1 | tr '[:lower:]' '[:upper:]')
        local season_num=$(echo "$s" | sed -E 's/S([0-9]+)E[0-9]+/\1/')
        local episode_num=$(echo "$s" | sed -E 's/S[0-9]+E([0-9]+)/\1/')
        printf "S%02dE%02d" "$season_num" "$episode_num"
        return
    fi

    if echo "$filename" | grep -iqE '\b([0-9]{1,2})x([0-9]{1,2})\b'; then
        local match=$(echo "$filename" | grep -ioE '\b[0-9]{1,2}x[0-9]{1,2}\b' | head -n1)
        local season_num=$(echo "$match" | cut -d'x' -f1)
        local episode_num=$(echo "$match" | cut -d'x' -f2)
        printf "S%02dE%02d" "$season_num" "$episode_num"
        return
    fi

    echo ""
}

# Ses Etiketini Tespit Etme (DUAL / TR / TR_Altyazili)
detect_audio_tag() {
    local full_target="$1" # Uzak URL veya yerel dosya yolu
    local filename="$2"

    # 1. Dosya isminde "DUAL" geçiyorsa doğrudan DUAL
    if echo "$filename" | grep -iq "DUAL"; then
        echo "DUAL"
        return
    fi

    # 2. ffprobe ile uzaktan HTTP/FTP veya yerel dosya ses kanallarını incele
    if command -v "$FFPROBE_CMD" &> /dev/null || [ -x "$FFPROBE_CMD" ]; then
        local probe_json=""
        probe_json=$("$FFPROBE_CMD" -v error -show_entries stream=index,codec_type:stream_tags=language -select_streams a -of json "$full_target" 2>/dev/null || echo "")

        if [ -n "$probe_json" ]; then
            if command -v php &> /dev/null; then
                local res=$(php -r '
                    $data = json_decode($argv[1], true);
                    $streams = $data["streams"] ?? array();
                    $count = count($streams);
                    if ($count > 1) {
                        echo "DUAL";
                    } elseif ($count === 1) {
                        $lang = strtolower($streams[0]["tags"]["language"] ?? "");
                        if (in_array($lang, array("tur", "tr", "turkish"))) {
                            echo "TR";
                        } elseif (!empty($lang)) {
                            echo "TR_Altyazili";
                        } else {
                            echo "UNK";
                        }
                    } else {
                        echo "NONE";
                    }
                ' "$probe_json" 2>/dev/null || echo "UNK")

                if [ "$res" = "DUAL" ] || [ "$res" = "TR" ] || [ "$res" = "TR_Altyazili" ]; then
                    echo "$res"
                    return
                fi
            fi
        fi
    fi

    # 3. İsim bazlı yedek kontrol
    if echo "$filename" | grep -iqE '\b(TR|TURKCE|TURKISH|TSI)\b'; then
        echo "TR"
    elif echo "$filename" | grep -iqE '\b(ALTYAZILI|SUBBED|ENG|ENGLISH)\b'; then
        echo "TR_Altyazili"
    else
        echo "TR"
    fi
}

# Çözünürlük / Sürüm Tespit Etme
detect_resolution() {
    local full_target="$1"
    local filename="$2"

    if echo "$filename" | grep -iqE '\bm1080p\b'; then echo "m1080p"; return; fi
    if echo "$filename" | grep -iqE '\bm720p\b'; then echo "m720p"; return; fi
    if echo "$filename" | grep -iqE '\bm2160p\b'; then echo "m2160p"; return; fi
    if echo "$filename" | grep -iqE '\b1080p\b'; then echo "1080p"; return; fi
    if echo "$filename" | grep -iqE '\b2160p|4k|m4k\b'; then echo "2160p"; return; fi
    if echo "$filename" | grep -iqE '\b720p\b'; then echo "720p"; return; fi
    if echo "$filename" | grep -iqE '\b480p\b'; then echo "480p"; return; fi

    if command -v "$FFPROBE_CMD" &> /dev/null || [ -x "$FFPROBE_CMD" ]; then
        local height=$("$FFPROBE_CMD" -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$full_target" 2>/dev/null || echo "")
        if [ -n "$height" ] && [ "$height" -eq "$height" ] 2>/dev/null; then
            if [ "$height" -ge 1400 ]; then echo "2160p"; return; fi
            if [ "$height" -ge 900 ]; then echo "1080p"; return; fi
            if [ "$height" -ge 600 ]; then echo "720p"; return; fi
            if [ "$height" -lt 600 ]; then echo "480p"; return; fi
        fi
    fi

    echo "1080p"
}

# Kaynak / Kalite Tespiti
detect_source() {
    local filename="$1"
    
    if echo "$filename" | grep -iqE 'web-dl|webdl'; then echo "Web-DL"; return; fi
    if echo "$filename" | grep -iqE 'webrip|web-rip'; then echo "WEBRip"; return; fi
    if echo "$filename" | grep -iqE 'bluray|blu-ray|bdrip|brrip'; then echo "BluRay"; return; fi
    if echo "$filename" | grep -iqE 'hdtv'; then echo "HDTV"; return; fi
    if echo "$filename" | grep -iqE 'remux'; then echo "REMUX"; return; fi
    if echo "$filename" | grep -iqE 'dvdrip|dvd'; then echo "DVDRip"; return; fi

    echo "Web-DL"
}

# Kodek Tespiti
detect_codec() {
    local full_target="$1"
    local filename="$2"

    if echo "$filename" | grep -iqE '\bx265\b'; then echo "x265"; return; fi
    if echo "$filename" | grep -iqE '\bx264\b'; then echo "x264"; return; fi
    if echo "$filename" | grep -iqE '\bh265|hevc\b'; then echo "h265"; return; fi
    if echo "$filename" | grep -iqE '\bh264|avc\b'; then echo "h264"; return; fi

    if command -v "$FFPROBE_CMD" &> /dev/null || [ -x "$FFPROBE_CMD" ]; then
        local codec=$("$FFPROBE_CMD" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$full_target" 2>/dev/null || echo "")
        if [ "$codec" = "hevc" ]; then echo "x265"; return; fi
        if [ "$codec" = "h264" ]; then echo "x264"; return; fi
    fi

    echo "x264"
}

# Temiz Arama Başlığı ve Yıl Çıkarma
clean_search_title() {
    local filename="$1"
    local base_name="${filename%.*}"

    # Baştaki '---' öneklerini temizle
    base_name=$(echo "$base_name" | sed -E 's/^-+//')

    local year=""
    if echo "$base_name" | grep -qE '\b(19[0-9]{2}|20[0-9]{2})\b'; then
        year=$(echo "$base_name" | grep -oE '\b(19[0-9]{2}|20[0-9]{2})\b' | tail -n1)
    fi

    local title_part="$base_name"
    if [ -n "$year" ]; then
        title_part=$(echo "$base_name" | sed -E "s/(.*)\b$year\b.*/\1/")
    fi
    title_part=$(echo "$title_part" | sed -E 's/\b(S[0-9]{1,2}E[0-9]{1,2}|[0-9]{1,2}x[0-9]{1,2}).*//i')

    title_part=$(echo "$title_part" | sed -E \
        -e 's/uHDFilmindir|Filmindir|DivxUp|TSI|uHD//gi' \
        -e 's/\b(m1080p|m720p|m2160p|1080p|720p|2160p|4k|web-dl|webdl|webrip|bluray|bdrip|hdtv|remux)\b//gi' \
        -e 's/\b(x264|x265|h264|h265|hevc|avc|10bit|dual|tr|eng|turkish|english)\b//gi' \
        -e 's/\[[^]]*\]//g' -e 's/\([^)]*\)//g' \
        -e 's/[._+-]/ /g')

    local clean_title=$(echo "$title_part" | awk '{$1=$1;print}')
    
    echo "$clean_title|$year"
}

# TMDB API Üzerinden Orijinal / İngilizce İsmi Bulma
query_tmdb() {
    local title="$1"
    local year="$2"
    local media_type="$3"

    if [ -z "$TMDB_API_KEY" ]; then
        echo ""
        return
    fi

    if command -v php &> /dev/null; then
        php -r '
            $title = $argv[1];
            $year = $argv[2];
            $mediaType = $argv[3];
            $apiKey = $argv[4];

            $endpoint = ($mediaType === "series") ? "tv" : "movie";
            $url = "https://api.themoviedb.org/3/search/{$endpoint}?api_key={$apiKey}&query=" . urlencode($title) . "&language=en-US";
            if (!empty($year)) {
                $param = ($mediaType === "series") ? "first_air_date_year" : "year";
                $url .= "&{$param}={$year}";
            }

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            $json = curl_exec($ch);
            curl_close($ch);

            $data = json_decode($json, true);
            $results = $data["results"] ?? array();

            if (empty($results) && !empty($year)) {
                $url = "https://api.themoviedb.org/3/search/{$endpoint}?api_key={$apiKey}&query=" . urlencode($title) . "&language=en-US";
                $ch = curl_init($url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                $json = curl_exec($ch);
                curl_close($ch);
                $data = json_decode($json, true);
                $results = $data["results"] ?? array();
            }

            if (empty($results)) {
                echo "";
                exit;
            }

            $first = $results[0];
            if ($mediaType === "series") {
                $tmdbTitle = $first["name"] ?? $first["original_name"] ?? "";
                $airDate = $first["first_air_date"] ?? "";
                $tmdbYear = !empty($airDate) ? explode("-", $airDate)[0] : "";
            } else {
                $tmdbTitle = $first["title"] ?? $first["original_title"] ?? "";
                $relDate = $first["release_date"] ?? "";
                $tmdbYear = !empty($relDate) ? explode("-", $relDate)[0] : "";
            }

            $sq = chr(39);
            $map = array("’"=>$sq, "‘"=>$sq, "`"=>$sq, "´"=>$sq);
            $normSearch = preg_replace("/[^a-z0-9]/", "", strtolower(strtr($title, $map)));
            $normTmdb   = preg_replace("/[^a-z0-9]/", "", strtolower(strtr($tmdbTitle, $map)));

            $isConfident = 0;
            if ($normSearch === $normTmdb) {
                $isConfident = 1;
            } elseif (!empty($normSearch) && !empty($normTmdb) && (strpos($normTmdb, $normSearch) !== false || strpos($normSearch, $normTmdb) !== false)) {
                $isConfident = 1;
            } else {
                similar_text($normSearch, $normTmdb, $percent);
                if ($percent >= 55.0) {
                    $isConfident = 1;
                }
            }

            if (!empty($year) && !empty($tmdbYear) && $normSearch !== $normTmdb) {
                $diff = abs((int)$year - (int)$tmdbYear);
                if ($diff > 3) {
                    $isConfident = 0;
                }
            }

            echo "{$tmdbTitle}|{$tmdbYear}|{$isConfident}";
        ' "$title" "$year" "$media_type" "$TMDB_API_KEY" 2>/dev/null
    fi
}

# ==============================================================================
# Uzak Sunucu İşlem Mantığı (WebDAV / FTP / Local)
# ==============================================================================

# Tekil Dosya İsim Hesaplama ve Yeniden Adlandırma Komutu Oluşturma
compute_new_filename() {
    local file_path="$1"       # Uzak veya yerel göreli dosya yolu
    local full_probe_url="$2"  # ffprobe için URL veya yerel yol
    local file_name=$(basename "$file_path")
    local ext="${file_name##*.}"
    local ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    # Video uzantısı kontrolü
    case "$ext_lower" in
        mkv|mp4|avi|m4v|ts|m2ts|mov|webm|flv|wmv|iso) ;;
        *) echo ""; return ;;
    esac

    echo -e "${BLUE}------------------------------------------------------------${NC}" >&2
    echo -e "${CYAN}İşleniyor:${NC} $file_name" >&2

    local media_type=$(detect_media_type "$file_path" "$file_name")
    local search_info=$(clean_search_title "$file_name")
    local parsed_title=$(echo "$search_info" | cut -d'|' -f1)
    local parsed_year=$(echo "$search_info" | cut -d'|' -f2)

    echo -n "TMDB sorgulanıyor... " >&2
    local tmdb_result=$(query_tmdb "$parsed_title" "$parsed_year" "$media_type")
    local tmdb_title=""
    local tmdb_year=""
    local tmdb_status="0"

    if [ -n "$tmdb_result" ]; then
        tmdb_title=$(echo "$tmdb_result" | cut -d'|' -f1)
        tmdb_year=$(echo "$tmdb_result" | cut -d'|' -f2)
        tmdb_status=$(echo "$tmdb_result" | cut -d'|' -f3)
    fi

    local is_uncertain=false
    if [ -z "$tmdb_result" ] || [ "$tmdb_status" = "0" ]; then
        is_uncertain=true
    fi

    if [ "$is_uncertain" = true ]; then
        if [ -n "$tmdb_title" ]; then
            echo -e "${YELLOW}EMİN OLUNAMADI [TMDB: $tmdb_title (${tmdb_year:-N/A})] (Dosya ismine '---' eklenecek)${NC}" >&2
        else
            echo -e "${YELLOW}BULUNAMADI (TMDB kaydı bulunamadı, dosya ismine '---' eklenecek)${NC}" >&2
        fi

        if [[ "$file_name" == ---* ]]; then
            echo -e "${YELLOW}--> Dosya zaten '---' önekiyle işaretlenmiş, değişiklik yapılmadı.${NC}" >&2
            echo "" >&2
            return
        else
            local uncert_name="---${file_name}"
            echo -e "   - Durum      : ${YELLOW}Emin olunamadı (İsim değiştirilmedi, önek eklendi)${NC}" >&2
            echo -e "   - Yeni İsim  : ${YELLOW}${uncert_name}${NC}" >&2
            echo "$uncert_name"
            return
        fi
    else
        echo -e "${GREEN}BAŞARILI [TMDB: $tmdb_title (${tmdb_year:-N/A})]${NC}" >&2
    fi

    local final_title_raw="${tmdb_title:-$parsed_title}"
    local final_year="${tmdb_year:-$parsed_year}"
    local sanitized_title=$(sanitize_title "$final_title_raw")

    if [ -z "$sanitized_title" ]; then
        echo -e "${RED}Uyarı: Başlık ayrıştırılamadı, atlanıyor.${NC}" >&2
        echo "" >&2
        return
    fi

    local resolution=$(detect_resolution "$full_probe_url" "$file_name")
    local source=$(detect_source "$file_name")
    local codec=$(detect_codec "$full_probe_url" "$file_name")
    local audio_tag=$(detect_audio_tag "$full_probe_url" "$file_name")

    local new_name=""
    if [ "$media_type" = "series" ]; then
        local se_tag=$(extract_season_episode "$file_name")
        if [ -n "$se_tag" ]; then
            if [ -n "$final_year" ]; then
                new_name="${sanitized_title}.${se_tag}.${final_year}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
            else
                new_name="${sanitized_title}.${se_tag}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
            fi
        else
            if [ -n "$final_year" ]; then
                new_name="${sanitized_title}.${final_year}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
            else
                new_name="${sanitized_title}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
            fi
        fi
    else
        if [ -n "$final_year" ]; then
            new_name="${sanitized_title}.${final_year}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
        else
            new_name="${sanitized_title}.${resolution}.${source}.${codec}.${audio_tag}.TSI.${ext_lower}"
        fi
    fi

    echo -e "   - Tür        : ${YELLOW}${media_type}${NC}" >&2
    echo -e "   - Başlık     : ${YELLOW}${final_title_raw}${NC} -> ${GREEN}${sanitized_title}${NC}" >&2
    echo -e "   - Yıl        : ${YELLOW}${final_year:-Belirtilmedi}${NC}" >&2
    echo -e "   - Sürüm/Çöz  : ${YELLOW}${resolution}${NC}" >&2
    echo -e "   - Kaynak     : ${YELLOW}${source}${NC}" >&2
    echo -e "   - Kodek      : ${YELLOW}${codec}${NC}" >&2
    echo -e "   - Ses Etiketi: ${YELLOW}${audio_tag}${NC}" >&2
    echo -e "   - Yeni İsim  : ${GREEN}${new_name}${NC}" >&2

    if [ "$file_name" = "$new_name" ]; then
        echo -e "${YELLOW}--> Dosya ismi zaten standart biçimde, değişiklik yapılmadı.${NC}" >&2
        echo "" >&2
        return
    fi

    echo "$new_name"
}

# WebDAV İşlemleri
process_webdav() {
    local base_url="${REMOTE_URL%/}"
    local target_dir="${REMOTE_DIR#/}"
    local full_url="${base_url}/${target_dir}"
    full_url="${full_url%/}"

    echo -e "${BLUE}[+] WebDAV Sunucusuna bağlanılıyor: ${full_url}${NC}"

    # PROPFIND ile (Depth: infinity) tüm alt klasörler dahil dosya listesini çek
    local propfind_xml=""
    propfind_xml=$(curl -s -k -u "${REMOTE_USER}:${REMOTE_PASS}" -X PROPFIND -H "Depth: infinity" "${full_url}/" || echo "")

    # Eğer Depth: infinity kabul edilmediyse Depth: 1 deneyelim
    if [ -z "$propfind_xml" ]; then
        propfind_xml=$(curl -s -k -u "${REMOTE_USER}:${REMOTE_PASS}" -X PROPFIND -H "Depth: 1" "${full_url}/" || echo "")
    fi

    if [ -z "$propfind_xml" ]; then
        echo -e "${RED}Hata: WebDAV sunucusundan dosya listesi alınamadı. Lütfen URL ve giriş bilgilerini kontrol edin.${NC}"
        exit 1
    fi

    # XML yanıtındaki dosya href yollarını PHP ile parse et
    local file_paths=$(php -r '
        $xmlStr = $argv[1];
        if (empty($xmlStr)) exit;
        $xml = @simplexml_load_string($xmlStr);
        if (!$xml) exit;
        $xml->registerXPathNamespace("d", "DAV:");
        $nodes = $xml->xpath("//d:response/d:href");
        foreach ($nodes as $node) {
            $path = (string)$node;
            $decoded = urldecode($path);
            if (!preg_match("/\.(mkv|mp4|avi|m4v|ts|m2ts|mov|webm|flv|wmv|iso)$/i", $decoded)) continue;
            echo $decoded . "\n";
        }
    ' "$propfind_xml" 2>/dev/null || echo "")

    if [ -z "$file_paths" ]; then
        echo -e "${YELLOW}WebDAV dizininde işlenecek video dosyası bulunamadı.${NC}"
        return
    fi

    echo "$file_paths" | while read -r raw_href; do
        if [ -z "$raw_href" ]; then continue; fi

        local file_name=$(basename "$raw_href")
        local dir_path=$(dirname "$raw_href")
        
        # ffprobe için tam HTTP URL oluştur (HTTP Range sorgusu ile uzaktan ses dili tespiti)
        local scheme=$(echo "$base_url" | grep -oE '^(https?://)')
        local host_part=${base_url#$scheme}
        local probe_url="${scheme}${REMOTE_USER}:${REMOTE_PASS}@${host_part}${raw_href}"

        local new_name=$(compute_new_filename "$file_name" "$probe_url")

        if [ -n "$new_name" ]; then
            local old_full_url="${base_url}${raw_href}"
            local new_full_url="${base_url}${dir_path}/${new_name}"

            if [ "$DRY_RUN" = true ]; then
                echo -e "${CYAN}[SIMULATION WebDAV MOVE]:${NC} $file_name -> $new_name"
            else
                echo -n "WebDAV MOVE yapılıyor... "
                local http_code=$(curl -s -k -o /dev/null -w "%{http_code}" -u "${REMOTE_USER}:${REMOTE_PASS}" -X MOVE -H "Destination: ${new_full_url}" "${old_full_url}")
                if [[ "$http_code" =~ ^(201|204|200)$ ]]; then
                    echo -e "${GREEN}✓ BAŞARILI${NC}"
                else
                    echo -e "${RED}HATA (HTTP $http_code)${NC}"
                fi
            fi
        fi
    done
}

# FTP İşlemleri
process_ftp() {
    echo -e "${BLUE}[+] FTP Sunucusuna bağlanılıyor (Özyinelemeli / Tüm Alt Klasörler): ${REMOTE_HOST}:${REMOTE_PORT}${REMOTE_DIR}${NC}"

    local file_list=""
    file_list=$(php -r '
        $host = $argv[1];
        $port = (int)$argv[2];
        $user = $argv[3];
        $pass = $argv[4];
        $baseDir = $argv[5];

        $files = array();
        $queue = array(rtrim($baseDir, "/"));
        if (empty($queue[0])) $queue[0] = "/";

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");

        while (!empty($queue)) {
            $dir = array_shift($queue);
            $url = "ftp://{$host}:{$port}" . rtrim($dir, "/") . "/";
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_FTPLISTONLY, false);
            $output = curl_exec($ch);

            if (empty($output)) {
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_FTPLISTONLY, true);
                $output = curl_exec($ch);
            }

            if (empty($output)) continue;

            $lines = explode("\n", str_replace("\r", "", $output));
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line)) continue;

                $isDir = false;
                $name = "";

                if (preg_match("/^d[rwx\-]{9}/i", $line)) {
                    $isDir = true;
                    $parts = preg_split("/\s+/", $line, 9);
                    $name = $parts[8] ?? "";
                } elseif (preg_match("/<DIR>/i", $line)) {
                    $isDir = true;
                    $parts = preg_split("/\s+/", $line, 4);
                    $name = $parts[3] ?? "";
                } elseif (preg_match("/^-[rwx\-]{9}/i", $line)) {
                    $parts = preg_split("/\s+/", $line, 9);
                    $name = $parts[8] ?? "";
                } else {
                    $name = $line;
                }

                if (empty($name) || $name === "." || $name === "..") continue;

                $itemPath = rtrim($dir, "/") . "/" . ltrim($name, "/");

                if ($isDir) {
                    $queue[] = $itemPath;
                } else {
                    if (preg_match("/\.(mkv|mp4|avi|m4v|ts|m2ts|mov|webm|flv|wmv|iso)$/i", $name)) {
                        $files[] = $itemPath;
                    }
                }
            }
        }
        curl_close($ch);
        foreach ($files as $f) {
            echo $f . "\n";
        }
    ' "$REMOTE_HOST" "$REMOTE_PORT" "$REMOTE_USER" "$REMOTE_PASS" "$REMOTE_DIR" 2>/dev/null || echo "")

    if [ -z "$file_list" ]; then
        echo -e "${YELLOW}FTP dizininde işlenecek video dosyası bulunamadı veya FTP bağlantısı kurulamadı.${NC}"
        return
    fi

    echo "$file_list" | while read -r rel_path; do
        if [ -z "$rel_path" ]; then continue; fi

        local file_name=$(basename "$rel_path")
        local dir_path=$(dirname "$rel_path")

        local probe_url="ftp://${REMOTE_USER}:${REMOTE_PASS}@${REMOTE_HOST}:${REMOTE_PORT}${rel_path}"
        local new_name=$(compute_new_filename "$file_name" "$probe_url")

        if [ -n "$new_name" ]; then
            local old_path="${rel_path}"
            old_path=$(echo "$old_path" | sed -E 's#//+#/#g')
            local new_path="${dir_path}/${new_name}"
            new_path=$(echo "$new_path" | sed -E 's#//+#/#g')

            if [ "$DRY_RUN" = true ]; then
                echo -e "${CYAN}[SIMULATION FTP RNFR/RNTO]:${NC} $file_name -> $new_name"
            else
                echo -n "FTP Yeniden Adlandırılıyor... "
                curl -s --user "${REMOTE_USER}:${REMOTE_PASS}" "ftp://${REMOTE_HOST}:${REMOTE_PORT}/" \
                    -Q "RNFR ${old_path}" \
                    -Q "RNTO ${new_path}" > /dev/null
                echo -e "${GREEN}✓ BAŞARILI${NC}"
            fi
        fi
    done
}

# Yerel Dizin İşlemleri
process_local() {
    local target_dir="$REMOTE_DIR"

    if [ ! -d "$target_dir" ]; then
        echo -e "${RED}Hata: Belirtilen yerel dizin bulunamadı: $target_dir${NC}"
        exit 1
    fi

    echo -e "${BLUE}[+] Yerel dizin işleniyor (Tüm Alt Klasörler Dahil): ${target_dir}${NC}"

    find "$target_dir" -type f \( -iname "*.mkv" -o -iname "*.mp4" -o -iname "*.avi" -o -iname "*.m4v" -o -iname "*.ts" -o -iname "*.m2ts" -o -iname "*.mov" -o -iname "*.webm" -o -iname "*.flv" -o -iname "*.wmv" -o -iname "*.iso" \) | while read -r file_path; do
        local file_name=$(basename "$file_path")
        local dir_name=$(dirname "$file_path")
        
        local new_name=$(compute_new_filename "$file_path" "$file_path")

        if [ -n "$new_name" ]; then
            local target_filepath="${dir_name}/${new_name}"

            if [ "$DRY_RUN" = true ]; then
                echo -e "${CYAN}[SIMULATION Yerel Rename]:${NC} $file_name -> $new_name"
            else
                if [ -f "$target_filepath" ]; then
                    echo -e "${RED}Hata: Hedef dosya zaten mevcut: $new_name${NC}"
                else
                    mv "$file_path" "$target_filepath"
                    echo -e "${GREEN}✓ BAŞARIYLA YENİDEN ADLANDIRILDI${NC}"
                fi
            fi
        fi
    done
}

# ==============================================================================
# Ana Çalıştırma Akışı
# ==============================================================================

check_dependencies
parse_args "$@"

# Eğer parametreler girilmemişse interaktif menüyü çalıştır
if [ -z "$PROTOCOL" ] || [ -z "$REMOTE_URL$REMOTE_HOST$REMOTE_DIR" ]; then
    interactive_setup
fi

echo ""
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${GREEN}İşlem Başlatılıyor...${NC}"
echo -e "  - Protokol : ${YELLOW}${PROTOCOL}${NC}"
echo -e "  - Mod      : $( [ "$DRY_RUN" = true ] && echo -e "${CYAN}Simülasyon (Dry-Run)${NC}" || echo -e "${GREEN}Canlı (Dosyalar Yeniden Adlandırılacak)${NC}" )"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

case "$PROTOCOL" in
    webdav) process_webdav ;;
    ftp) process_ftp ;;
    local) process_local ;;
    *) echo -e "${RED}Geçersiz protokol seçimi!${NC}"; exit 1 ;;
esac

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✓ İşlem Tamamlandı.${NC}"
echo -e "${GREEN}================================================================${NC}"
