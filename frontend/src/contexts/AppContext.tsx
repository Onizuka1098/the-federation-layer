import React, { useEffect, useReducer, useState } from 'react';
import { Page } from '../basic/NavBar';
import { OpenDialogs } from '../basic/MainDialogs';

import {
  Book,
  Maker,
  Robot,
  Garage,
  Settings,
  Favorites,
  defaultMaker,
  Coordinator,
  Exchange,
  Order,
  Version,
  PublicOrder,
  Limits,
  defaultExchange,
  Federation,
} from '../models';

import { apiClient } from '../services/api';
import { systemClient } from '../services/System';
import { getClientVersion, getHost, tokenStrength } from '../utils';
import { sha256 } from 'js-sha256';

import defaultFederation from '../../static/federation.json';
import { useTheme } from '@mui/material';
import { updateExchangeInfo } from '../models/Exchange.model';

const getWindowSize = function (fontSize: number) {
  // returns window size in EM units
  return {
    width: window.innerWidth / fontSize,
    height: window.innerHeight / fontSize,
  };
};

// Refresh delays (ms) according to Order status
const statusToDelay = [
  3000, // 'Waiting for maker bond'
  35000, // 'Public'
  180000, // 'Paused'
  3000, // 'Waiting for taker bond'
  999999, // 'Cancelled'
  999999, // 'Expired'
  8000, // 'Waiting for trade collateral and buyer invoice'
  8000, // 'Waiting only for seller trade collateral'
  8000, // 'Waiting only for buyer invoice'
  10000, // 'Sending fiat - In chatroom'
  10000, // 'Fiat sent - In chatroom'
  100000, // 'In dispute'
  999999, // 'Collaboratively cancelled'
  10000, // 'Sending satoshis to buyer'
  60000, // 'Sucessful trade'
  30000, // 'Failed lightning network routing'
  300000, // 'Wait for dispute resolution'
  300000, // 'Maker lost dispute'
  300000, // 'Taker lost dispute'
];

export interface SlideDirection {
  in: 'left' | 'right' | undefined;
  out: 'left' | 'right' | undefined;
}

export interface fetchRobotProps {
  action?: 'login' | 'generate' | 'refresh';
  newKeys?: { encPrivKey: string; pubKey: string } | null;
  newToken?: string | null;
  refCode?: string | null;
  slot?: number | null;
  setBadRequest?: (state: string) => void;
}

export type TorStatus = 'NOTINIT' | 'STARTING' | '"Done"' | 'DONE';

const initialFederation: Federation = Object.entries(defaultFederation).reduce(
  (acc, [key, value]) => {
    acc[key] = new Coordinator(value);
    return acc;
  },
  {},
);

interface ActionFederation {
  type: 'reset' | 'enable' | 'disable' | 'updateBook' | 'updateLimits' | 'updateInfo';
  action: any; // TODO
}

const reduceFederation = (federation: Federation, action: ActionFederation) => {
  switch (action.type) {
    case 'reset':
      return initialFederation;
    case 'enable':
      return {
        ...federation,
        [action.payload.shortAlias]: {
          ...federation[action.payload.shortAlias],
          enabled: true,
        },
      };
    case 'disable':
      return {
        ...federation,
        [action.payload.shortAlias]: {
          ...federation[action.payload.shortAlias],
          enabled: false,
          info: undefined,
        },
      };
    case 'updateBook':
      return {
        ...federation,
        [action.payload.shortAlias]: {
          ...federation[action.payload.shortAlias],
          book: action.payload.book,
          loadingBook: action.payload.loadingBook,
        },
      };
    case 'updateLimits':
      return {
        ...federation,
        [action.payload.shortAlias]: {
          ...federation[action.payload.shortAlias],
          limits: action.payload.limits,
          loadingLimits: action.payload.loadingLimits,
        },
      };
    case 'updateInfo':
      return {
        ...federation,
        [action.payload.shortAlias]: {
          ...federation[action.payload.shortAlias],
          info: action.payload.info,
          loadingInfo: action.payload.loadingInfo,
        },
      };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
};

const totalCoordinators = Object.keys(initialFederation).length;

const initialBook: Book = {
  orders: [],
  loading: true,
  loadedCoordinators: 0,
  totalCoordinators,
};

const initialLimits: Limits = {
  list: [],
  loading: true,
  loadedCoordinators: 0,
  totalCoordinators,
};

const initialExchange: Exchange = { ...defaultExchange, totalCoordinators };

export interface AppContextProps {
  torStatus: TorStatus;
  federation: Federation;
  dispatchFederation: (state: Federation, action: ActionFederation) => void;
  settings: Settings;
  setSettings: (state: Settings) => void;
  book: Book;
  garage: Garage;
  setGarage: (state: Garage) => void;
  currentSlot: number;
  setCurrentSlot: (state: number) => void;
  setBook: (state: Book) => void;
  fetchFederationBook: () => void;
  limits: Limits;
  setLimits: (state: Limits) => void;
  fetchFederationLimits: () => void;
  maker: Maker;
  setMaker: (state: Maker) => void;
  clearOrder: () => void;
  robot: Robot;
  setRobot: (state: Robot) => void;
  exchange: Exchange;
  setExchange: (state: Exchange) => void;
  focusedCoordinator: string;
  setFocusedCoordinator: (state: string) => void;
  baseUrl: string;
  setBaseUrl: (state: string) => void;
  fav: Favorites;
  setFav: (state: Favorites) => void;
  order: Order | undefined;
  setOrder: (state: Order | undefined) => void;
  badOrder: string;
  setBadOrder: (state: string | undefined) => void;
  setDelay: (state: number) => void;
  page: Page;
  setPage: (state: Page) => void;
  slideDirection: SlideDirection;
  setSlideDirection: (state: SlideDirection) => void;
  currentOrder: string | undefined;
  setCurrentOrder: (state: string) => void;
  navbarHeight: number;
  closeAll: OpenDialogs;
  open: OpenDialogs;
  setOpen: (state: OpenDialogs) => void;
  windowSize: { width: number; height: number };
  clientVersion: {
    semver: Version;
    short: string;
    long: string;
  };
}

const entryPage: Page | '' =
  window.NativeRobosats === undefined ? window.location.pathname.split('/')[1] : '';

const closeAll = {
  more: false,
  learn: false,
  community: false,
  info: false,
  coordinator: false,
  exchange: false,
  client: false,
  update: false,
  profile: false,
};

// export const initialState = {
//   federation: defaultFederation,
//   dispatchFederation: () => null,
//   settings: new Settings(),
//   setSettings: () => null,
//   book: { orders: [], loading: true },
//   setBook: () => null,
//   fetchFederationBook: () => null,
//   limits: {
//     list: [],
//     loading: true,
//   },
//   setLimits:() => null,
//   fetchFederationLimits: ()=> null,
//   maker: defaultMaker,
//   setMaker: () => null,
//   clearOrder: () => null,
//   robot: new Robot(),
//   setRobot: () => null,
//   setExchange: () => null,
//   focusedCoordinator: 0,
//   setFocusedCoordinator: () => null,
//   baseUrl: '',
//   setBaseUrl: () => null,
//   fav: { type: null, currency: 0 },
//   setFav: () => null,
//   order: undefined,
//   setOrder: () => null,
//   badOrder: '',
//   setBadOrder: () => null,
//   setDelay: () => null,
//   page: entryPage == '' ? 'robot' : entryPage,
//   setPage: () => null,
//   slideDirection: {
//     in: undefined,
//     out: undefined,
//   },
//   setSlideDirection: () => null,
//   currentOrder: undefined,
//   setCurrentOrder: () => null,
//   navbarHeight: 2.5,
//   closeAll,
//   open: closeAll,
//   setOpen: () => null,
//   windowSize: getWindowSize(14),
// }

export interface AppContextProviderProps {
  children: React.ReactNode;
  settings: Settings;
  setSettings: (state: Settings) => void;
}

export const AppContextProvider = ({
  children,
  settings,
  setSettings,
}: AppContextProviderProps): JSX.Element => {
  const theme = useTheme();

  // All app data structured
  const network = 'Onion';
  const [torStatus, setTorStatus] = useState<TorStatus>('NOTINIT');
  const [book, setBook] = useState<Book>(initialBook);
  const [limits, setLimits] = useState<Limits>(initialLimits);
  const [garage, setGarage] = useState<Garage>(() => {
    const initialState = { setGarage };
    const newGarage = new Garage(initialState);
    return newGarage;
  });
  const [currentSlot, setCurrentSlot] = useState<number>(garage.slots.length - 1);
  const [robot, setRobot] = useState<Robot>(new Robot(garage.slots[currentSlot].robot));
  const [maker, setMaker] = useState<Maker>(defaultMaker);
  const [exchange, setExchange] = useState<Exchange>(initialExchange);
  const [federation, dispatchFederation] = useReducer(reduceFederation, initialFederation);

  const [focusedCoordinator, setFocusedCoordinator] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [fav, setFav] = useState<Favorites>({ type: null, currency: 0, mode: 'fiat' });

  const [delay, setDelay] = useState<number>(60000);
  const [timer, setTimer] = useState<NodeJS.Timer | undefined>(() =>
    setInterval(() => null, delay),
  );
  const [order, setOrder] = useState<Order | undefined>(undefined);
  const [badOrder, setBadOrder] = useState<string | undefined>(undefined);

  const [page, setPage] = useState<Page>(entryPage == '' ? 'robot' : entryPage);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>({
    in: undefined,
    out: undefined,
  });
  const [currentOrder, setCurrentOrder] = useState<number | undefined>(undefined);

  const navbarHeight = 2.5;
  const clientVersion = getClientVersion();

  const [open, setOpen] = useState<OpenDialogs>(closeAll);

  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>(() =>
    getWindowSize(theme.typography.fontSize),
  );

  useEffect(() => {
    window.addEventListener('torStatus', (event) => {
      // UX improv: delay the "Conencted" status by 10 secs to avoid long waits for first requests
      setTimeout(() => setTorStatus(event?.detail), event?.detail === '"Done"' ? 5000 : 0);
    });
  }, []);

  useEffect(() => {
    if (typeof window !== undefined) {
      window.addEventListener('resize', onResize);
    }

    return () => {
      if (typeof window !== undefined) {
        window.removeEventListener('resize', onResize);
      }
    };
  }, []);

  useEffect(() => {
    let host = '';
    if (window.NativeRobosats === undefined) {
      host = getHost();
    } else {
      host = federation[0][settings.network].Onion;
    }
    setBaseUrl(`http://${host}`);

    // On bitcoin network change we reset book, limits and federation info and fetch everything again
    setBook(initialBook);
    setLimits(initialLimits);
    dispatchFederation({ type: 'reset' });
    fetchFederationBook();
    fetchFederationInfo();
    fetchFederationLimits();
  }, [settings.network]);

  useEffect(() => {
    setWindowSize(getWindowSize(theme.typography.fontSize));
  }, [theme.typography.fontSize]);

  const onResize = function () {
    setWindowSize(getWindowSize(theme.typography.fontSize));
  };

  // fetch Limits
  const fetchCoordinatorLimits = async (coordinator: Coordinator) => {
    const url = coordinator[settings.network][network];
    const limits = await apiClient
      .get(url, '/api/limits/')
      .then((data) => {
        return data;
      })
      .catch(() => {
        return undefined;
      });
    dispatchFederation({
      type: 'updateLimits',
      payload: { shortAlias: coordinator.shortAlias, limits, loadingLimits: false },
    });
  };

  const fetchFederationLimits = function () {
    Object.entries(federation).map(([shortAlias, coordinator]) => {
      if (coordinator.enabled === true) {
        // set limitLoading=true
        dispatchFederation({
          type: 'updateLimits',
          payload: { shortAlias, limits: coordinator.limits, loadingLimits: true },
        });
        // fetch new limits
        fetchCoordinatorLimits(coordinator);
      }
    });
  };

  // fetch Books
  const fetchCoordinatorBook = async (coordinator: Coordinator) => {
    const url = coordinator[settings.network][network];
    const book = await apiClient
      .get(url, '/api/book/')
      .then((data) => {
        return data.not_found ? [] : data;
      })
      .catch(() => {
        return [];
      });
    dispatchFederation({
      type: 'updateBook',
      payload: { shortAlias: coordinator.shortAlias, book, loadingBook: false },
    });
  };

  const fetchFederationBook = function () {
    Object.entries(federation).map(([shortAlias, coordinator]) => {
      if (coordinator.enabled === true) {
        dispatchFederation({
          type: 'updateBook',
          payload: { shortAlias, book: coordinator.book, loadingBook: true },
        });
        fetchCoordinatorBook(coordinator);
      }
    });
  };

  // fetch Info
  const fetchCoordinatorInfo = async (coordinator: Coordinator) => {
    const url = coordinator[settings.network][network];
    const info = await apiClient
      .get(url, '/api/info/')
      .then((data) => {
        return data;
      })
      .catch(() => {
        return undefined;
      });
    dispatchFederation({
      type: 'updateInfo',
      payload: { shortAlias: coordinator.shortAlias, info, loadingInfo: false },
    });
  };

  const fetchFederationInfo = function () {
    Object.entries(federation).map(([shortAlias, coordinator]) => {
      if (coordinator.enabled === true) {
        dispatchFederation({
          type: 'updateInfo',
          payload: { shortAlias, info: coordinator.info, loadingInfo: true },
        });
        fetchCoordinatorInfo(coordinator);
      }
    });
  };

  console.log(exchange);

  const updateBook = () => {
    setBook((book) => {
      return { ...book, loading: true, loadedCoordinators: 0 };
    });
    let orders: PublicOrder[] = book.orders;
    let loadedCoordinators: number = 0;
    let totalCoordinators: number = 0;
    Object.values(federation).map((coordinator) => {
      if (coordinator.enabled) {
        totalCoordinators = totalCoordinators + 1;
        if (!coordinator.loadingBook) {
          const existingOrders = orders.filter(
            (order) => order.coordinatorShortAlias !== coordinator.shortAlias,
          );
          console.log('Existing Orders', existingOrders);
          const newOrders: PublicOrder[] = coordinator.book.map((order) => ({
            ...order,
            coordinatorShortAlias: coordinator.shortAlias,
          }));
          orders = [...existingOrders, ...newOrders];
          // orders.push.apply(existingOrders, newOrders);
          loadedCoordinators = loadedCoordinators + 1;
        }
      }
      const loading = loadedCoordinators != totalCoordinators;
      setBook({ orders, loading, loadedCoordinators, totalCoordinators });
    });
  };

  const updateLimits = () => {
    let newLimits: LimitList | never[] = [];
    Object.entries(federation).map(([shortAlias, coordinator]) => {
      if (coordinator.limits) {
        for (const currency in coordinator.limits) {
          newLimits[currency] = compareUpdateLimit(
            newLimits[currency],
            coordinator.limits[currency],
          );
        }
      }
    });
    setLimits(newLimits);
  };

  const updateExchange = () => {
    const onlineCoordinators = Object.keys(federation).reduce((count, shortAlias) => {
      if (!federation[shortAlias].loadingInfo && federation[shortAlias].info) {
        return count + 1;
      } else {
        return count;
      }
    }, 0);
    const totalCoordinators = Object.keys(federation).reduce((count, shortAlias) => {
      return federation[shortAlias].enabled ? count + 1 : count;
    }, 0);
    setExchange({ info: updateExchangeInfo(federation), onlineCoordinators, totalCoordinators });
  };

  useEffect(() => {
    updateBook();
    // updateLimits();
    updateExchange();
  }, [federation]);

  // const fetchInfo = function () {
  //   Object.entries(federation).map(([shortAlias, coordinator]) => {
  //     if (coordinator.enabled) {
  //       coordinator.fetchInfo({ bitcoin: 'mainnet', network: 'Clearnet' }, () =>
  //         setFederation((f) => {
  //           return f;
  //         }),
  //       );
  //     }
  //   });
  // };

  useEffect(() => {
    if (open.exchange) {
      fetchFederationInfo();
    }
  }, [open.exchange, torStatus]);

  useEffect(() => {
    fetchFederationInfo();
  }, []);

  // useEffect(() => {
  //   // Sets Setting network from coordinator API param if accessing via web
  //   if (settings.network == undefined && info.network) {
  //     setSettings((settings: Settings) => {
  //       return { ...settings, network: info.network };
  //     });
  //   }
  // }, [info]);

  // Fetch current order at load and in a loop
  useEffect(() => {
    if (currentOrder != undefined && (page == 'order' || (order == badOrder) == undefined)) {
      fetchOrder();
    }
  }, [currentOrder, page]);

  useEffect(() => {
    clearInterval(timer);
    setTimer(setInterval(fetchOrder, delay));
    return () => clearInterval(timer);
  }, [delay, currentOrder, page, badOrder]);

  const orderReceived = function (data: any) {
    if (data.bad_request != undefined) {
      setBadOrder(data.bad_request);
      setDelay(99999999);
      setOrder(undefined);
    } else {
      setDelay(
        data.status >= 0 && data.status <= 18
          ? page == 'order'
            ? statusToDelay[data.status]
            : statusToDelay[data.status] * 5
          : 99999999,
      );
      setOrder(data);
      setBadOrder(undefined);
    }
  };

  const fetchOrder = function () {
    if (currentOrder != undefined) {
      apiClient.get(baseUrl, '/api/order/?order_id=' + currentOrder).then(orderReceived);
    }
  };

  const clearOrder = function () {
    setOrder(undefined);
    setBadOrder(undefined);
  };

  const fetchRobot = function ({
    action = 'login',
    newKeys = null,
    newToken = null,
    refCode = null,
    slot = null,
    setBadRequest = () => {},
  }: fetchRobotProps) {
    const oldRobot = robot;
    const targetSlot = slot ?? currentSlot;
    const token = newToken ?? oldRobot.token;
    if (action != 'refresh') {
      setRobot(new Robot());
    }
    setBadRequest('');

    const requestBody = {};
    if (action == 'login' || action == 'refresh') {
      requestBody.token_sha256 = sha256(token);
    } else if (action == 'generate' && token != null) {
      const strength = tokenStrength(token);
      requestBody.token_sha256 = sha256(token);
      requestBody.unique_values = strength.uniqueValues;
      requestBody.counts = strength.counts;
      requestBody.length = token.length;
      requestBody.ref_code = refCode;
      requestBody.public_key = newKeys?.pubKey ?? oldRobot.pubKey;
      requestBody.encrypted_private_key = newKeys?.encPrivKey ?? oldRobot.encPrivKey;
    }

    apiClient.post(baseUrl, '/api/user/', requestBody).then((data: any) => {
      let newRobot = robot;
      setCurrentOrder(
        data.active_order_id
          ? data.active_order_id
          : data.last_order_id
          ? data.last_order_id
          : null,
      );
      if (data.bad_request) {
        setBadRequest(data.bad_request);
        newRobot = {
          ...oldRobot,
          loading: false,
          nickname: data.nickname ?? oldRobot.nickname,
          activeOrderId: data.active_order_id ?? null,
          referralCode: data.referral_code ?? oldRobot.referralCode,
          earnedRewards: data.earned_rewards ?? oldRobot.earnedRewards,
          lastOrderId: data.last_order_id ?? oldRobot.lastOrderId,
          stealthInvoices: data.wants_stealth ?? robot.stealthInvoices,
          tgEnabled: data.tg_enabled,
          tgBotName: data.tg_bot_name,
          tgToken: data.tg_token,
          found: false,
        };
      } else {
        newRobot = {
          ...oldRobot,
          nickname: data.nickname,
          token,
          loading: false,
          activeOrderId: data.active_order_id ?? null,
          lastOrderId: data.last_order_id ?? null,
          referralCode: data.referral_code,
          earnedRewards: data.earned_rewards ?? 0,
          stealthInvoices: data.wants_stealth,
          tgEnabled: data.tg_enabled,
          tgBotName: data.tg_bot_name,
          tgToken: data.tg_token,
          found: data?.found,
          bitsEntropy: data.token_bits_entropy,
          shannonEntropy: data.token_shannon_entropy,
          pubKey: data.public_key,
          encPrivKey: data.encrypted_private_key,
          copiedToken: !!data.found,
        };
        setRobot(newRobot);
        garage.updateRobot(newRobot, targetSlot);
        setCurrentSlot(targetSlot);
        systemClient.setItem('robot_token', token);
      }
    });
  };

  useEffect(() => {
    if (baseUrl != '' && page != 'robot') {
      if (open.profile && robot.avatarLoaded) {
        fetchRobot({ action: 'refresh' }); // refresh/update existing robot
      } else if (!robot.avatarLoaded && robot.token && robot.encPrivKey && robot.pubKey) {
        fetchRobot({ action: 'generate' }); // create new robot with existing token and keys (on network and coordinator change)
      }
    }
  }, [open.profile, baseUrl]);

  return (
    <AppContext.Provider
      value={{
        torStatus,
        settings,
        setSettings,
        book,
        setBook,
        federation,
        dispatchFederation,
        garage,
        setGarage,
        currentSlot,
        setCurrentSlot,
        fetchFederationBook,
        limits,
        setLimits,
        fetchFederationLimits,
        maker,
        setMaker,
        clearOrder,
        robot,
        setRobot,
        fetchRobot,
        exchange,
        setExchange,
        focusedCoordinator,
        setFocusedCoordinator,
        baseUrl,
        setBaseUrl,
        fav,
        setFav,
        order,
        setOrder,
        badOrder,
        setBadOrder,
        setDelay,
        page,
        setPage,
        slideDirection,
        setSlideDirection,
        currentOrder,
        setCurrentOrder,
        navbarHeight,
        closeAll,
        open,
        setOpen,
        windowSize,
        clientVersion,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const AppContext = React.createContext();
