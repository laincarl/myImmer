interface Prop {
  source: object;
  proxy: Object;
  clone: Object | undefined;
  parent: Object | undefined;
  key: string | number | symbol | undefined;
}
interface Draft {
  [propName: string]: any;
}
interface DraftFunction {
  (draft: Draft): void;
}
/**
 * 获取一个数据的精确类型
 *
 * @param {*} something
 * @returns
 */
function getType(something: any) {
  return Object.prototype.toString
    .call(something)
    .slice(8, -1)
    .toLowerCase();
}
/**
 * 浅拷贝
 * TODO: 其他数据类型的拷贝
 * @param {*} something
 * @returns
 */
function shallowCopy(something: any) {
  const type = getType(something);
  switch (type) {
    case 'object': {
      return { ...something };
    }
    case 'array': {
      return something.slice();
    }
    case 'map': {
      return new Map(something);
    }
    // case 'object': {
    //   return { ...something };
    // }
    // case 'object': {
    //   return { ...something };
    // }
    // case 'object': {
    //   return { ...something };
    // }
    default: {
      return something;
    }
  }
}
function produce(state: Object, fn: DraftFunction) {
  const objects = new Map();
  function isObject(something: any) {
    return ['object', 'array', 'map'].includes(getType(something));
  }
  function isProxy(something: any) {
    return objects.has(something);
  }
  // 递归克隆，在克隆出的父元素上进行修改
  // TODO: 优化克隆，将克隆和赋值分离
  function cloneParents(
    parent: Object,
    clonedChild: any,
    key: string | number | symbol
  ) {
    const attrs = objects.get(parent);
    const { clone, key: nextKey, parent: nextParent } = attrs;
    // 如果已经克隆过，直接使用克隆过的，更改值即可
    const clonedParent = clone || shallowCopy(parent);
    if (getType(clonedParent) === 'map') {
      clonedParent.set(key, clonedChild);
    } else {
      Reflect.set(clonedParent, key, clonedChild);
    }

    // 如果是克隆过的，说明其所有父元素已经被克隆，那么不需要进行克隆
    if (clone) {
      return;
    }
    Object.assign(attrs, { clone: clonedParent });
    if (nextParent) {
      cloneParents(nextParent, clonedParent, nextKey);
    }
  }
  /**
   *
   * 只有在get时再设置proxy,set时再进行克隆
   * @param {Object} object
   * @param {Object} [parent]
   * @param {PropertyKey} [key]
   * @returns {Object}
   */
  function lazyProxy(
    object: Object,
    parent?: Object,
    key?: PropertyKey
  ): Object {
    const proxy = new Proxy(object, {
      get: function(target: Draft, propKey: string | number) {
        // console.log('get', propKey)
        const current = Reflect.get(target, propKey);
        // 是对象才进行处理
        if (isObject(current)) {
          // 如果没有设置代理，就设置，以让其子操作时可以被监测到
          if (!isProxy(current)) {
            const proxy = lazyProxy(current, target, propKey);
            // console.log('为子设置代理', propKey)
            return proxy;
          } else {
            // console.log('第二次获取', propKey)
            // 获取时,这时判断,如果已经更改过,就返回代理对象,否则返回原对象
            const attrs = objects.get(current);
            return attrs.proxy;
            // return attrs.modify ? attrs.clone : attrs.source;
          }
        } else {
          const attrs = objects.get(target);
          const result = attrs.clone
            ? Reflect.get(attrs.clone, propKey)
            : current;
          // TODO: get时不克隆，优化set的逻辑
          if (
            typeof result === 'function' &&
            ['get', 'set'].includes(String(propKey))
          ) {
            return function(key: any, value: any) {
              cloneParents(target, value, key);
              // console.log(objects.get(target))
              // return result.call(objects.get(target).clone, key, value)
            };
          }
          return result;
        }
      },
      // 这里获取到的targe是克隆过的对象
      set: function(target, propKey: string | number, value, receiver) {
        // console.log('set')
        if (Reflect.get(target, propKey) !== value) {
          // console.log(target, objects.get(target))
          // console.log('set', '开始克隆', propKey);
          // 递归克隆
          cloneParents(target, value, propKey);
          return true;
        }
        // console.log('=')
        return Reflect.set(target, propKey, value, receiver);
      },
    });
    const prop: Prop = {
      source: object,
      proxy,
      clone: undefined,
      parent,
      key,
    };
    objects.set(object, prop);
    return proxy;
  }
  const proxy = lazyProxy(state);
  fn(proxy);
  const { clone, source } = objects.get(state);
  return clone || source;
}
export default produce;
