# Stub for cv2 (opencv)
class VideoCapture:
    def __init__(self, filename: str) -> None: ...
    def isOpened(self) -> bool: ...
    def get(self, propId: int) -> float: ...
    def set(self, propId: int, value: float) -> bool: ...
    def read(self) -> tuple[bool, Any]: ...
    def release(self) -> None: ...

class VideoWriter:
    def __init__(self, filename: str, fourcc: int, fps: float, frameSize: tuple[int, int], isColor: bool = True) -> None: ...
    def write(self, image: Any) -> None: ...
    def release(self) -> None: ...

def cvtColor(src: Any, code: int) -> Any: ...
def resize(src: Any, dsize: tuple[int, int], fx: float = 0, fy: float = 0, interpolation: int = 1) -> Any: ...
def GaussianBlur(src: Any, ksize: tuple[int, int], sigmaX: float) -> Any: ...
def medianBlur(src: Any, ksize: int) -> Any: ...
def bilateralFilter(src: Any, d: int, sigmaColor: float, sigmaSpace: float) -> Any: ...
def Canny(image: Any, threshold1: float, threshold2: float) -> Any: ...
def findContours(image: Any, mode: int, method: int) -> tuple[Any, Any]: ...
def drawContours(image: Any, contours: Any, contourIdx: int, color: tuple, thickness: int) -> Any: ...
def boundingRect(array: Any) -> tuple[int, int, int, int]: ...
def contourArea(contour: Any) -> float: ...
def approxPolyDP(curve: Any, epsilon: float, closed: bool) -> Any: ...
def moments(array: Any) -> dict: ...
def minEnclosingCircle(points: Any) -> tuple[tuple[float, float], float]: ...
def fitEllipse(points: Any) -> tuple[tuple[float, float], tuple[float, float], float]: ...
def matchTemplate(image: Any, templ: Any, method: int) -> Any: ...
def minMaxLoc(src: Any) -> tuple[float, float, tuple[int, int], tuple[int, int]]: ...
def threshold(src: Any, thresh: float, maxval: float, type: int) -> tuple[float, Any]: ...
def adaptiveThreshold(src: Any, maxValue: float, adaptiveMethod: int, thresholdType: int, blockSize: int, C: float) -> Any: ...
def equalizeHist(src: Any) -> Any: ...
def createCLAHE(clipLimit: float = 2.0, tileGridSize: tuple[int, int] = (8, 8)) -> Any: ...
def calcHist(images: list, channels: list, mask: Any, histSize: list, ranges: list) -> Any: ...
def compareHist(H1: Any, H2: Any, method: int) -> float: ...
def cornerHarris(src: Any, blockSize: int, ksize: int, k: float) -> Any: ...
def cornerSubPix(image: Any, corners: Any, winSize: tuple[int, int], zeroZone: tuple[int, int], criteria: tuple) -> Any: ...
def goodFeaturesToTrack(image: Any, maxCorners: int, qualityLevel: float, minDistance: float) -> Any: ...
def calcOpticalFlowPyrLK(prevImg: Any, nextImg: Any, prevPts: Any, nextPts: Any = None, **kwargs: Any) -> tuple[Any, Any, Any]: ...
def calcOpticalFlowFarneback(prev: Any, next: Any, flow: Any, pyr_scale: float, levels: int, winsize: int, iterations: int, poly_n: int, poly_sigma: float, flags: int) -> Any: ...
def buildOpticalFlowPyramid(img: Any, winSize: tuple[int, int], maxLevel: int, withDerivatives: bool, pyrBorder: int, derivBorder: int, tryReuseInputImage: bool) -> Any: ...
def pyramid_down(src: Any, dstsize: tuple[int, int] = (0, 0)) -> Any: ...
def pyramid_up(src: Any, dstsize: tuple[int, int] = (0, 0)) -> Any: ...
def VideoCapture(filename: str) -> VideoCapture: ...
def VideoWriter(filename: str, fourcc: int, fps: float, frameSize: tuple[int, int], isColor: bool = True) -> VideoWriter: ...

CAP_PROP_POS_MSEC = 0
CAP_PROP_POS_FRAMES = 1
CAP_PROP_POS_AVI_RATIO = 2
CAP_PROP_FRAME_WIDTH = 3
CAP_PROP_FRAME_HEIGHT = 4
CAP_PROP_FPS = 5
CAP_PROP_FOURCC = 6
CAP_PROP_FRAME_COUNT = 7
CAP_PROP_FORMAT = 8
CAP_PROP_MODE = 9
CAP_PROP_BRIGHTNESS = 10
CAP_PROP_CONTRAST = 11
CAP_PROP_SATURATION = 12
CAP_PROP_HUE = 13
CAP_PROP_GAIN = 14
CAP_PROP_EXPOSURE = 15
CAP_PROP_CONVERT_RGB = 16
CAP_PROP_WHITE_BALANCE_BLUE_U = 17
CAP_PROP_RECTIFICATION = 18
CAP_PROP_MONOCHROME = 19
CAP_PROP_SHARPNESS = 20
CAP_PROP_AUTO_EXPOSURE = 21
CAP_PROP_GAMMA = 22
CAP_PROP_TEMPERATURE = 23
CAP_PROP_TRIGGER = 24
CAP_PROP_TRIGGER_DELAY = 25
CAP_PROP_WHITE_BALANCE_RED_V = 26
CAP_PROP_ZOOM = 27
CAP_PROP_FOCUS = 28
CAP_PROP_GUID = 29
CAP_PROP_ISO_SPEED = 30
CAP_PROP_BACKLIGHT = 31
CAP_PROP_PAN = 32
CAP_PROP_TILT = 33
CAP_PROP_ROLL = 34
CAP_PROP_IRIS = 35
CAP_PROP_SETTINGS = 36
CAP_PROP_BUFFERSIZE = 37
CAP_PROP_AUTOFOCUS = 38
CAP_PROP_SAR_NUM = 39
CAP_PROP_SAR_DEN = 40
CAP_PROP_BACKEND = 40
CAP_PROP_CHANNEL = 41
CAP_PROP_AUTO_WB = 41
CAP_PROP_WB_TEMPERATURE = 42
CAP_PROP_CODEC_PIXEL_FORMAT = 42
CAP_PROP_BITRATE = 43
CAP_PROP_ORIENTATION_META = 43
CAP_PROP_ORIENTATION_AUTO = 44

COLOR_BGR2GRAY = 6
COLOR_BGR2RGB = 4
COLOR_RGB2BGR = 4
COLOR_GRAY2BGR = 8
COLOR_BGR2HSV = 40
COLOR_HSV2BGR = 54
COLOR_BGR2LAB = 44
COLOR_LAB2BGR = 56
COLOR_BGR2LUV = 50
COLOR_LUV2BGR = 52
COLOR_BGR2YUV = 38
COLOR_YUV2BGR = 39
COLOR_BGR2YCrCb = 36
COLOR_YCrCb2BGR = 37

THRESH_BINARY = 0
THRESH_BINARY_INV = 1
THRESH_TRUNC = 2
THRESH_TOZERO = 3
THRESH_TOZERO_INV = 4
THRESH_MASK = 7
THRESH_OTSU = 8
THRESH_TRIANGLE = 16

ADAPTIVE_THRESH_MEAN_C = 0
ADAPTIVE_THRESH_GAUSSIAN_C = 1

MORPH_ERODE = 0
MORPH_DILATE = 1
MORPH_OPEN = 2
MORPH_CLOSE = 3
MORPH_GRADIENT = 4
MORPH_TOPHAT = 5
MORPH_BLACKHAT = 6
MORPH_HITMISS = 7

INTER_NEAREST = 0
INTER_LINEAR = 1
INTER_CUBIC = 2
INTER_AREA = 3
INTER_LANCZOS4 = 4
INTER_MAX = 7
INTER_LINEAR_EXACT = 5
INTER_NEAREST_EXACT = 6

RETR_EXTERNAL = 0
RETR_LIST = 1
RETR_CCOMP = 2
RETR_TREE = 3
RETR_FLOODFILL = 4

CHAIN_APPROX_NONE = 1
CHAIN_APPROX_SIMPLE = 2
CHAIN_APPROX_TC89_L1 = 3
CHAIN_APPROX_TC89_KCOS = 4
CHAIN_APPROX_TC89_L2 = 5
CHAIN_APPROX_TC89_KCOS_L2 = 6

CC_STAT_LEFT = 0
CC_STAT_TOP = 1
CC_STAT_WIDTH = 2
CC_STAT_HEIGHT = 3
CC_STAT_AREA = 4
CC_STAT_MAX = 5

CC_STAT_LEFT = 0
CC_STAT_TOP = 1
CC_STAT_WIDTH = 2
CC_STAT_HEIGHT = 3
CC_STAT_AREA = 4
CC_STAT_MAX = 5

CV_8U = 0
CV_8S = 1
CV_16U = 2
CV_16S = 3
CV_32S = 4
CV_32F = 5
CV_64F = 6
CV_USRTYPE1 = 7

DIST_USER = -1
DIST_L1 = 1
DIST_L2 = 2
DIST_C = 3
DIST_L12 = 4
DIST_FAIR = 5
DIST_WELSCH = 6
DIST_HUBER = 7

TM_SQDIFF = 0
TM_SQDIFF_NORMED = 1
TM_CCORR = 2
TM_CCORR_NORMED = 3
TM_CCOEFF = 4
TM_CCOEFF_NORMED = 5

DFT_INVERSE = 1
DFT_SCALE = 2
DFT_ROWS = 4
DFT_COMPLEX_OUTPUT = 8
DFT_REAL_OUTPUT = 16
DFT_COMPLEX_INPUT = 32
DFT_SCALE = 2

KMEANS_RANDOM_CENTERS = 0
KMEANS_PP_CENTERS = 2
KMEANS_USE_INITIAL_LABELS = 1

FLANN_INDEX_KDTREE = 1
FLANN_INDEX_KMEANS = 2
FLANN_INDEX_COMPOSITE = 3
FLANN_INDEX_KDTREE_SINGLE = 4
FLANN_INDEX_HIERARCHICAL = 5
FLANN_INDEX_LSH = 6
FLANN_INDEX_SAVED = 254
FLANN_INDEX_AUTOTUNED = 255

CV_8U = 0
CV_8S = 1
CV_16U = 2
CV_16S = 3
CV_32S = 4
CV_32F = 5
CV_64F = 6

CAP_OPENNI_IMAGE_GENERATOR = 1 << 0
CAP_OPENNI_IMAGE_GENERATOR_PRESENT = 1 << 1
CAP_OPENNI_IR_GENERATOR = 1 << 2
CAP_OPENNI_IR_GENERATOR_PRESENT = 1 << 3

COLOR_BGR2GRAY = 6
COLOR_BGR2RGB = 4
COLOR_RGB2BGR = 4
COLOR_GRAY2BGR = 8
COLOR_BGR2HSV = 40
COLOR_HSV2BGR = 54
COLOR_BGR2LAB = 44
COLOR_LAB2BGR = 56
COLOR_BGR2LUV = 50
COLOR_LUV2BGR = 52
COLOR_BGR2YUV = 38
COLOR_YUV2BGR = 39
COLOR_BGR2YCrCb = 36
COLOR_YCrCb2BGR = 37

THRESH_BINARY = 0
THRESH_BINARY_INV = 1
THRESH_TRUNC = 2
THRESH_TOZERO = 3
THRESH_TOZERO_INV = 4
THRESH_MASK = 7
THRESH_OTSU = 8
THRESH_TRIANGLE = 16

ADAPTIVE_THRESH_MEAN_C = 0
ADAPTIVE_THRESH_GAUSSIAN_C = 1

MORPH_ERODE = 0
MORPH_DILATE = 1
MORPH_OPEN = 2
MORPH_CLOSE = 3
MORPH_GRADIENT = 4
MORPH_TOPHAT = 5
MORPH_BLACKHAT = 6
MORPH_HITMISS = 7

INTER_NEAREST = 0
INTER_LINEAR = 1
INTER_CUBIC = 2
INTER_AREA = 3
INTER_LANCZOS4 = 4
INTER_MAX = 7
INTER_LINEAR_EXACT = 5
INTER_NEAREST_EXACT = 6

RETR_EXTERNAL = 0
RETR_LIST = 1
RETR_CCOMP = 2
RETR_TREE = 3
RETR_FLOODFILL = 4

CHAIN_APPROX_NONE = 1
CHAIN_APPROX_SIMPLE = 2
CHAIN_APPROX_TC89_L1 = 3
CHAIN_APPROX_TC89_KCOS = 4
CHAIN_APPROX_TC89_L2 = 5
CHAIN_APPROX_TC89_KCOS_L2 = 6

CC_STAT_LEFT = 0
CC_STAT_TOP = 1
CC_STAT_WIDTH = 2
CC_STAT_HEIGHT = 3
CC_STAT_AREA = 4
CC_STAT_MAX = 5

CV_8U = 0
CV_8S = 1
CV_16U = 2
CV_16S = 3
CV_32S = 4
CV_32F = 5
CV_64F = 6
CV_USRTYPE1 = 7

DIST_USER = -1
DIST_L1 = 1
DIST_L2 = 2
DIST_C = 3
DIST_L12 = 4
DIST_FAIR = 5
DIST_WELSCH = 6
DIST_HUBER = 7

TM_SQDIFF = 0
TM_SQDIFF_NORMED = 1
TM_CCORR = 2
TM_CCORR_NORMED = 3
TM_CCOEFF = 4
TM_CCOEFF_NORMED = 5

DFT_INVERSE = 1
DFT_SCALE = 2
DFT_ROWS = 4
DFT_COMPLEX_OUTPUT = 8
DFT_REAL_OUTPUT = 16
DFT_COMPLEX_INPUT = 32
DFT_SCALE = 2

KMEANS_RANDOM_CENTERS = 0
KMEANS_PP_CENTERS = 2
KMEANS_USE_INITIAL_LABELS = 1

FLANN_INDEX_KDTREE = 1
FLANN_INDEX_KMEANS = 2
FLANN_INDEX_COMPOSITE = 3
FLANN_INDEX_KDTREE_SINGLE = 4
FLANN_INDEX_HIERARCHICAL = 5
FLANN_INDEX_LSH = 6
FLANN_INDEX_KDTREE_SINGLE = 4
FLANN_INDEX_KDTREE = 1
FLANN_INDEX_KMEANS = 2
FLANN_INDEX_COMPOSITE = 3
FLANN_INDEX_KDTREE_SINGLE = 4
FLANN_INDEX_HIERARCHICAL = 5
FLANN_INDEX_LSH = 6
FLANN_INDEX_SAVED = 254
FLANN_INDEX_AUTOTUNED = 255

FLANN_INDEX_KDTREE = 1
FLANN_INDEX_KMEANS = 2
FLANN_INDEX_COMPOSITE = 3
FLANN_INDEX_KDTREE_SINGLE = 4
FLANN_INDEX_HIERARCHICAL = 5
FLANN_INDEX_LSH = 6
FLANN_INDEX_SAVED = 254
FLANN_INDEX_AUTOTUNED = 255